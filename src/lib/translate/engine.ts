import type { ChatBackend } from "../llm/client";
import type { Cue } from "../subtitle/types";
import {
  maskTags,
  restoreTags,
  sameTokens,
  hasTranslatableText,
  stripTokens,
} from "../subtitle/tags";
import {
  buildMessages,
  buildRefineMessages,
  parseTranslations,
  lenientSingle,
  type BatchLine,
  type ContextPair,
  type RefineLine,
} from "./prompt";
import { fixRtlMasked } from "./bidi";
import type { GlossaryEntry } from "./glossary";
import { toneInstruction } from "./tone";

export interface TranslateParams {
  cues: Cue[];
  backend: ChatBackend;
  /** Display name, e.g. "English" or "Auto-detect". */
  sourceName: string;
  targetName: string;
  batchSize?: number; // default 10
  contextLines?: number; // default 6
  maxRetries?: number; // default 2
  /** Free-text background about the material, injected into the system prompt. */
  contextNote?: string;
  /** Term mappings the model must honour; injected into the system prompt. */
  glossary?: GlossaryEntry[];
  /** Tone/formality id (see `tone.ts`); resolved to a prompt instruction. */
  tone?: string;
  /**
   * Run a second "refine" pass: after the draft is produced, the model reviews
   * each batch (source + draft) and returns an improved translation. ~Doubles
   * the calls. Best-effort — a refinement that fails id/token validation is
   * dropped and the first-pass draft is kept, so refine never makes output worse.
   */
  refine?: boolean;
  /**
   * Target language is right-to-left. When set, embedded LTR runs (Latin
   * letters/digits like `H1`, `Nf3`, names) in the translation are wrapped in
   * bidi isolates so they keep their order inside the RTL line. See `bidi.ts`.
   */
  rtl?: boolean;
  onProgress?: (done: number, total: number) => void;
  signal?: AbortSignal;
}

interface Prepared {
  cue: Cue;
  masked: string;
  map: string[];
  translatable: boolean;
  /** Masked first-pass translation, kept so the refine pass can improve it. */
  draftMasked?: string;
}

/**
 * Translate cues in place (mutates `cue.text`). Robustness path for weak local
 * models: validate by id and by formatting-token set; retry the failed subset;
 * finally translate stubborn lines one at a time (which always aligns), and
 * reconcile any missing tokens so styling is never lost.
 */
export async function translateCues(params: TranslateParams): Promise<void> {
  const { cues, backend, sourceName, targetName } = params;
  const batchSize = Math.max(1, params.batchSize ?? 10);
  const contextLines = Math.max(0, params.contextLines ?? 6);
  const maxRetries = Math.max(0, params.maxRetries ?? 2);
  const tone = toneInstruction(params.tone ?? "");

  const prepared: Prepared[] = cues.map((cue) => {
    const { masked, map } = maskTags(cue.text);
    return { cue, masked, map, translatable: hasTranslatableText(masked) };
  });

  const context: ContextPair[] = [];
  const translatables = prepared.filter((p) => p.translatable);

  // A refine pass adds one unit of work per translatable line.
  const total = cues.length + (params.refine ? translatables.length : 0);
  // Lines with nothing to translate (music notes, numbers) are already "done".
  let done = prepared.filter((p) => !p.translatable).length;
  params.onProgress?.(done, total);

  const ensureNotAborted = () => {
    if (params.signal?.aborted) throw new DOMException("Translation cancelled", "AbortError");
  };

  // Render a masked translation into the cue: fix RTL bidi on the MASKED text
  // (markup is still `⟦n⟧` tokens, so Latin inside restored tags is never touched,
  // and break tokens let us force base direction per visual line), then restore.
  const finalize = (p: Prepared, maskedTranslation: string) => {
    const finalMasked = params.rtl ? fixRtlMasked(maskedTranslation, p.map) : maskedTranslation;
    p.cue.text = restoreTags(finalMasked, p.map);
  };

  const commit = (p: Prepared, maskedTranslation: string) => {
    p.draftMasked = maskedTranslation;
    finalize(p, maskedTranslation);
    // Context fed back to the model keeps the un-processed text (no stray controls).
    context.push({ source: stripTokens(p.masked), target: stripTokens(maskedTranslation) });
    done++;
    params.onProgress?.(done, total);
  };

  // Translate a group; commit the good ones, return the ids still unresolved.
  const runGroup = async (items: Prepared[], strict: boolean): Promise<Set<string>> => {
    const batch: BatchLine[] = items.map((p) => ({ id: p.cue.id, masked: p.masked }));
    const messages = buildMessages(sourceName, targetName, batch, context.slice(-contextLines), strict, params.contextNote, params.glossary, tone);
    const reply = await backend.chat(messages, params.signal);
    const map = parseTranslations(reply);
    const failed = new Set<string>();
    for (const p of items) {
      const cand = map.get(p.cue.id);
      if (cand !== undefined && sameTokens(p.masked, cand)) commit(p, cand);
      else failed.add(p.cue.id);
    }
    return failed;
  };

  // Final guarantee: one line at a time, reconciling tokens so it always completes.
  const translateSingle = async (p: Prepared): Promise<void> => {
    const messages = buildMessages(
      sourceName,
      targetName,
      [{ id: p.cue.id, masked: p.masked }],
      context.slice(-contextLines),
      true,
      params.contextNote,
      params.glossary,
      tone,
    );
    const reply = await backend.chat(messages, params.signal);
    const parsed = parseTranslations(reply).get(p.cue.id) ?? lenientSingle(reply);
    commit(p, sameTokens(p.masked, parsed) ? parsed : reconcileTokens(p.masked, parsed));
  };

  for (let i = 0; i < translatables.length; i += batchSize) {
    ensureNotAborted();
    const slice = translatables.slice(i, i + batchSize);
    let failed = await runGroup(slice, false);

    for (let attempt = 0; attempt < maxRetries && failed.size > 0; attempt++) {
      ensureNotAborted();
      const retryItems = slice.filter((p) => failed.has(p.cue.id));
      failed = await runGroup(retryItems, true);
    }

    for (const p of slice.filter((p) => failed.has(p.cue.id))) {
      ensureNotAborted();
      await translateSingle(p);
    }
  }

  if (params.refine) await refinePass();

  // Second pass: ask the model to improve each batch's draft. Best-effort —
  // one call per batch, no retry/fallback; a refinement that fails id/token
  // validation is dropped so the (already valid) first-pass draft is kept.
  async function refinePass(): Promise<void> {
    for (let i = 0; i < translatables.length; i += batchSize) {
      ensureNotAborted();
      const slice = translatables.slice(i, i + batchSize);
      const batch: RefineLine[] = slice.map((p) => ({
        id: p.cue.id,
        source: p.masked,
        draft: p.draftMasked ?? p.masked,
      }));
      const messages = buildRefineMessages(
        sourceName,
        targetName,
        batch,
        params.contextNote,
        params.glossary,
        tone,
      );

      let map: Map<string, string> | null = null;
      try {
        map = parseTranslations(await backend.chat(messages, params.signal));
      } catch (err) {
        if (params.signal?.aborted) throw err;
        // A flaky refine call must not discard good drafts: keep them, move on.
      }

      for (const p of slice) {
        const cand = map?.get(p.cue.id);
        if (cand !== undefined && sameTokens(p.masked, cand)) finalize(p, cand);
        done++;
        params.onProgress?.(done, total);
      }
    }
  }
}

/** Force `candidate` to carry exactly the formatting tokens of `sourceMasked`. */
export function reconcileTokens(sourceMasked: string, candidate: string): string {
  const TOKEN = /⟦(\d+)⟧/g;
  const want = new Map<number, number>();
  let m: RegExpExecArray | null;
  while ((m = TOKEN.exec(sourceMasked))) want.set(Number(m[1]), (want.get(Number(m[1])) ?? 0) + 1);

  const seen = new Map<number, number>();
  let cleaned = candidate.replace(TOKEN, (whole, n: string) => {
    const id = Number(n);
    const allowed = want.get(id) ?? 0;
    const used = seen.get(id) ?? 0;
    if (used < allowed) {
      seen.set(id, used + 1);
      return whole;
    }
    return ""; // drop unknown/extra token
  });

  const missing: string[] = [];
  for (const [id, cnt] of want) {
    for (let k = seen.get(id) ?? 0; k < cnt; k++) missing.push(`⟦${id}⟧`);
  }
  if (missing.length) cleaned = cleaned.trimEnd() + missing.join("");
  return cleaned;
}
