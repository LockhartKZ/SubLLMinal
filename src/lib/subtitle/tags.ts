/**
 * Tag masking: before a line is sent to the LLM we replace every bit of
 * non-translatable markup with an opaque placeholder token (e.g. `⟦0⟧`), and
 * after translation we swap the tokens back. This is how "preserve all styling"
 * works — the model only ever sees and reorders the actual words.
 *
 * What gets masked:
 *  - ASS override blocks: `{\i1}`, `{\pos(...)}`, `{\c&H...&}`, …
 *  - ASS escapes: `\N` (hard break), `\n` (soft break), `\h` (hard space)
 *  - HTML/SRT inline tags: `<i>`, `</i>`, `<font color="...">`, …
 *  - real line breaks within a cue (so multi-line cues keep their structure)
 */

const TOKEN_OPEN = "⟦"; // ⟦
const TOKEN_CLOSE = "⟧"; // ⟧

// Order matters: try the longest/most specific constructs first.
const MASK_RE = /\{[^}]*\}|\\[Nnh]|<\/?[^>\n]+>|\r\n|\n/g;

function tokenRe(): RegExp {
  return new RegExp(`${TOKEN_OPEN}(\\d+)${TOKEN_CLOSE}`, "g");
}

export interface MaskResult {
  /** The text with markup replaced by `⟦i⟧` tokens. */
  masked: string;
  /** `map[i]` is the original substring that token `⟦i⟧` stands for. */
  map: string[];
}

export function maskTags(text: string): MaskResult {
  const map: string[] = [];
  const masked = text.replace(MASK_RE, (m) => {
    const i = map.length;
    map.push(m);
    return `${TOKEN_OPEN}${i}${TOKEN_CLOSE}`;
  });
  return { masked, map };
}

export function restoreTags(masked: string, map: string[]): string {
  return masked.replace(tokenRe(), (_whole, n: string) => map[Number(n)] ?? "");
}

/** Sorted multiset of token indices present in a masked string. */
export function tokenIds(masked: string): number[] {
  const re = tokenRe();
  const ids: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(masked))) ids.push(Number(m[1]));
  return ids.sort((a, b) => a - b);
}

/** True when two masked strings contain exactly the same token multiset. */
export function sameTokens(a: string, b: string): boolean {
  const ai = tokenIds(a);
  const bi = tokenIds(b);
  if (ai.length !== bi.length) return false;
  return ai.every((v, i) => v === bi[i]);
}

/** Remove tokens entirely — used to build human-readable translation context. */
export function stripTokens(masked: string): string {
  return masked
    .replace(tokenRe(), " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** True if there is at least one letter (any script) worth translating. */
export function hasTranslatableText(masked: string): boolean {
  return /\p{L}/u.test(masked);
}
