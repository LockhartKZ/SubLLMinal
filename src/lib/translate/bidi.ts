/**
 * Bidirectional-text fix for RTL output.
 *
 * When Latin runs (chess squares like `h1`, moves like `Nf3`/`e2-e4`, names,
 * model ids) appear in an RTL subtitle line, two things break:
 *  1. **Base direction.** A subtitle line is plain text with no `dir` attribute,
 *     so a player derives base direction from the first strong character. A line
 *     starting with a Latin run is laid out left-to-right and comes out reversed.
 *  2. **Run placement.** Even mid-line, weaker bidi engines reorder Latin/number
 *     runs around the surrounding Arabic and its commas.
 *
 * Fix: wrap each rendered line that contains a Latin run in a RIGHT-TO-LEFT
 * EMBEDDING (`U+202B` RLE … `U+202C` PDF) — this forces RTL base direction — and
 * pin each Latin run inside a LEFT-TO-RIGHT EMBEDDING (`U+202A` LRE … PDF) so it
 * stays an internally-LTR unit that can't merge with its neighbours.
 *
 * Why the *legacy* embedding controls and not the newer isolates (`U+2066`…):
 * tested live in VLC and MPC-HC, the isolates either get stripped (order still
 * wrong) or drawn as visible boxes. RLE/LRE/PDF are Unicode 3.0 and honoured by
 * those players' renderers. This matches what Subtitle Edit's "Fix RTL via
 * Unicode control characters" does.
 *
 * Lines with no Latin run are already correct RTL and are left untouched, so we
 * emit the minimum number of invisible controls. Everything is idempotent: any
 * directional controls we (or an older version) added are stripped first.
 */

/** RIGHT-TO-LEFT EMBEDDING — forces RTL base direction for a line. */
export const RLE = "‫";
/** LEFT-TO-RIGHT EMBEDDING — pins a Latin run as internally LTR. */
export const LRE = "‪";
/** POP DIRECTIONAL FORMATTING — closes an RLE or LRE. */
export const PDF = "‬";

/**
 * Every directional control we might have emitted, in this or an older version
 * (embeddings, marks, isolates). Stripped before re-processing so the transform
 * is idempotent and upgrades files translated by the old isolate-based code.
 */
const OWN_CONTROLS = /[‪‫‬‎‏⁦⁧⁨⁩]/g;

/**
 * A maximal LTR run: alphanumeric groups joined by single in-word separators
 * (space, apostrophe, dot, underscore, slash, hyphen). Separators only sit
 * *between* groups, so a match never has a leading/trailing separator.
 */
const LTR_RUN = /[A-Za-z0-9]+(?:[ '._/-][A-Za-z0-9]+)*/g;

/** A run is only worth pinning if it actually contains a Latin letter. */
const HAS_LATIN = /[A-Za-z]/;

/** Formatting-token pattern shared with the engine's masking (`⟦n⟧`). */
const TOKEN = /⟦(\d+)⟧/g;

/** A masked token whose original is a hard/soft line break (new bidi paragraph). */
const BREAK = /^(\\N|\\n|\r\n|\n)$/;

/** Pin each Latin-letter run inside an LTR embedding (`LRE…PDF`). */
export function embedLtrRuns(text: string): string {
  return text.replace(LTR_RUN, (run) => (HAS_LATIN.test(run) ? `${LRE}${run}${PDF}` : run));
}

/**
 * Fix one rendered line (may contain inline `⟦n⟧` markup tokens, but no line
 * breaks). If it carries a Latin run, wrap the whole line in an RTL embedding
 * (forcing RTL base direction) and pin each Latin run inside it. Pure-RTL or
 * pure-number lines are returned unchanged. Idempotent.
 */
export function fixRtlLine(line: string): string {
  const clean = line.replace(OWN_CONTROLS, ""); // drop our own controls first → idempotent
  if (!HAS_LATIN.test(clean)) return clean; // nothing that bidi can mis-order
  return `${RLE}${embedLtrRuns(clean)}${PDF}`;
}

/**
 * Apply the RTL bidi fix to a MASKED translation. Operates on the masked form
 * (markup is still `⟦n⟧` tokens) so Latin letters inside restored tags such as
 * `<i>` or `\N` are never treated as text. `map` is the engine's token map, used
 * to recognise which tokens are line breaks: the fix is applied per *visual
 * line*, since a renderer re-detects direction after every hard break and an
 * embedding must not span one. Idempotent.
 */
export function fixRtlMasked(masked: string, map: string[]): string {
  let out = "";
  let line = "";
  let last = 0;
  let m: RegExpExecArray | null;
  TOKEN.lastIndex = 0;
  while ((m = TOKEN.exec(masked))) {
    if (BREAK.test(map[Number(m[1])] ?? "")) {
      line += masked.slice(last, m.index);
      out += fixRtlLine(line) + m[0]; // keep the break token outside the embedding
      line = "";
      last = m.index + m[0].length;
    }
    // non-break tokens stay inline; they're swept into `line` at the next break.
  }
  line += masked.slice(last);
  return out + fixRtlLine(line);
}
