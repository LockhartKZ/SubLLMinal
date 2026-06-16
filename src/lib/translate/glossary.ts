/**
 * Glossary / terminology list.
 *
 * The user types free-text term mappings, one per line, in a settings box:
 *
 *     grandmaster = أستاذ كبير
 *     Nf3 => ن ف٣
 *     # comments and blank lines are ignored
 *
 * Parsed entries are injected into the system prompt (`buildSystemPrompt`) so
 * the model renders specific terms/names consistently. Stored as plain text in
 * settings; this module is the single parser.
 */

export interface GlossaryEntry {
  /** Term as it appears in the source (matched case-insensitively by the model). */
  source: string;
  /** Required rendering in the target language. */
  target: string;
}

// Source, an `=` (optionally `=>`), then the target. Non-greedy left side so we
// split on the FIRST separator and let the target keep any later `=`.
const LINE_RE = /^(.*?)\s*=>?\s*(.*)$/;

export function parseGlossary(text: string): GlossaryEntry[] {
  const out: GlossaryEntry[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = LINE_RE.exec(line);
    if (!m) continue;
    const source = m[1].trim();
    const target = m[2].trim();
    if (!source || !target) continue;
    out.push({ source, target });
  }
  return out;
}
