import type { ChatMessage } from "../llm/client";
import type { GlossaryEntry } from "./glossary";

/**
 * Prompt construction and response parsing for one batch.
 *
 * Each input line is tagged with an id like `[[3]]`. The model must echo the
 * same id on each translated line, which lets us align output by id (not by
 * position) and detect dropped/merged/extra lines. Formatting placeholders look
 * like `⟦0⟧` and must survive untouched.
 */

export interface BatchLine {
  id: string;
  /** Masked source text (markup already replaced by ⟦n⟧ tokens). */
  masked: string;
}

export interface ContextPair {
  source: string;
  target: string;
}

/** One line for the refine pass: the source plus its first-pass draft. */
export interface RefineLine {
  id: string;
  /** Masked source text. */
  source: string;
  /** Masked first-pass translation to be improved. */
  draft: string;
}

const ID_RE = /^\s*\[\[\s*([^\]]+?)\s*\]\]\s?(.*)$/;

function tag(id: string): string {
  return `[[${id}]]`;
}

/** Append the shared context-note / glossary / tone blocks (when present). */
function pushGuidanceBlocks(
  lines: string[],
  contextNote?: string,
  glossary?: GlossaryEntry[],
  toneInstruction?: string,
): void {
  const note = contextNote?.trim();
  if (note) {
    lines.push(
      "Background about this material — use it to pick the correct terminology,",
      "names, jargon, and tone (do NOT translate this background itself):",
      note,
    );
  }
  if (glossary && glossary.length > 0) {
    lines.push(
      "Glossary — whenever a source term below appears, render it EXACTLY as its",
      "target (match case-insensitively; inflect naturally if the grammar needs it):",
      ...glossary.map((g) => `- ${g.source} => ${g.target}`),
    );
  }
  const tone = toneInstruction?.trim();
  if (tone) lines.push(`Tone and register: ${tone}`);
}

export function buildSystemPrompt(
  sourceName: string,
  targetName: string,
  strict: boolean,
  contextNote?: string,
  glossary?: GlossaryEntry[],
  toneInstruction?: string,
): string {
  const from =
    sourceName.toLowerCase() === "auto-detect"
      ? "Detect the source language and translate"
      : `Translate from ${sourceName}`;
  const lines = [`You are a professional subtitle translator. ${from} to ${targetName}.`];
  pushGuidanceBlocks(lines, contextNote, glossary, toneInstruction);
  lines.push(
    "Rules:",
    "- Translate the meaning naturally and concisely, the way real subtitles read.",
    "- Every input line is prefixed with an id like [[3]]. Output one line per input,",
    "  prefixed with the SAME id, in the same order.",
    "- Return EXACTLY one line for each id. Never merge, split, add, or drop lines.",
    "- Keep every placeholder token such as ⟦0⟧ EXACTLY as-is (same digits), placed",
    "  naturally within the translated line. They stand for formatting and must remain.",
    "- Do NOT translate or alter the [[id]] markers or the ⟦n⟧ tokens.",
    "- Output ONLY the translated lines — no notes, no explanations, no blank lines.",
  );
  if (strict) {
    lines.push(
      "IMPORTANT: A previous attempt was malformed. Respond with nothing but the",
      "[[id]] lines, exactly one per id, preserving every ⟦n⟧ token.",
    );
  }
  return lines.join("\n");
}

export function buildUserPrompt(batch: BatchLine[], context: ContextPair[]): string {
  const parts: string[] = [];
  if (context.length > 0) {
    parts.push("Already translated earlier (for continuity — do NOT translate again):");
    parts.push(context.map((c) => `${c.source}  =>  ${c.target}`).join("\n"));
    parts.push("");
  }
  parts.push("Translate these lines:");
  parts.push(batch.map((b) => `${tag(b.id)} ${b.masked}`).join("\n"));
  return parts.join("\n");
}

export function buildMessages(
  sourceName: string,
  targetName: string,
  batch: BatchLine[],
  context: ContextPair[],
  strict = false,
  contextNote?: string,
  glossary?: GlossaryEntry[],
  toneInstruction?: string,
): ChatMessage[] {
  return [
    {
      role: "system",
      content: buildSystemPrompt(sourceName, targetName, strict, contextNote, glossary, toneInstruction),
    },
    { role: "user", content: buildUserPrompt(batch, context) },
  ];
}

// ---- refine (second) pass ---------------------------------------------------

export function buildRefineSystemPrompt(
  sourceName: string,
  targetName: string,
  contextNote?: string,
  glossary?: GlossaryEntry[],
  toneInstruction?: string,
): string {
  const from =
    sourceName.toLowerCase() === "auto-detect" ? "from the source language" : `from ${sourceName}`;
  const lines = [
    `You are a senior subtitle editor refining a draft translation ${from} into ${targetName}.`,
  ];
  pushGuidanceBlocks(lines, contextNote, glossary, toneInstruction);
  lines.push(
    "Each line below is the original followed by a draft translation. Improve the draft:",
    "- Fix mistranslations, awkward phrasing, and wrong register or terminology.",
    "- Make it read naturally and concisely, the way real subtitles do.",
    "- Output EXACTLY one line per id, prefixed with the SAME [[id]], in the same order.",
    "- Keep every placeholder token such as ⟦0⟧ exactly as in the draft — same digits,",
    "  none added or dropped.",
    "- If a draft is already good, repeat it unchanged.",
    "- Output ONLY the [[id]] lines — no notes, no explanations, no blank lines.",
  );
  return lines.join("\n");
}

export function buildRefineUserPrompt(batch: RefineLine[]): string {
  const parts = ["Improve each draft. Reply with `[[id]] improved line` for every id:"];
  parts.push(batch.map((b) => `${tag(b.id)} ${b.source}   (draft: ${b.draft})`).join("\n"));
  return parts.join("\n");
}

export function buildRefineMessages(
  sourceName: string,
  targetName: string,
  batch: RefineLine[],
  contextNote?: string,
  glossary?: GlossaryEntry[],
  toneInstruction?: string,
): ChatMessage[] {
  return [
    {
      role: "system",
      content: buildRefineSystemPrompt(sourceName, targetName, contextNote, glossary, toneInstruction),
    },
    { role: "user", content: buildRefineUserPrompt(batch) },
  ];
}

/** Parse `[[id]] translation` lines into a map. First occurrence per id wins. */
export function parseTranslations(content: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const rawLine of content.split(/\r?\n/)) {
    const m = ID_RE.exec(rawLine);
    if (m) {
      const id = m[1];
      if (!out.has(id)) out.set(id, m[2].trim());
    }
  }
  return out;
}

/** Lenient single-line extraction for the batch-size-1 fallback. */
export function lenientSingle(content: string): string {
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const m = ID_RE.exec(line);
    return (m ? m[2] : line).trim();
  }
  return content.trim();
}
