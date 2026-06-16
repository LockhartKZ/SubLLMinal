import type { Cue, ParsedSubtitle } from "./types";

/**
 * Advanced SubStation Alpha (.ass/.ssa) parser/serializer.
 *
 * Strategy for byte-exact round-tripping: keep every original line. Only the
 * `Text` field of `Dialogue:` lines (inside `[Events]`) becomes a translatable
 * cue. `Comment:` lines, styles, `[Script Info]`, fonts — everything else — is
 * preserved verbatim. The `Text` field is always last and may itself contain
 * commas, so we split by counting commas up to the Text column.
 */

interface LineEntry {
  raw: string;
  /** Present only for translatable Dialogue lines. */
  prefix?: string; // everything up to and including the comma before Text
  cue?: Cue;
}

/** Map each `Format:` column name (lowercased) to its 0-based index. */
function parseFormatFields(formatLine: string): Map<string, number> {
  const names = formatLine
    .slice(formatLine.indexOf(":") + 1)
    .split(",")
    .map((f) => f.trim().toLowerCase());
  const map = new Map<string, number>();
  names.forEach((name, i) => map.set(name, i));
  return map;
}

/** `H:MM:SS.cc` (ASS centiseconds) -> milliseconds. */
function parseAssTime(t: string): number | undefined {
  const m = /(\d+):(\d{2}):(\d{2})[.:](\d{2})/.exec(t.trim());
  if (!m) return undefined;
  return (
    Number(m[1]) * 3_600_000 +
    Number(m[2]) * 60_000 +
    Number(m[3]) * 1_000 +
    Number(m[4]) * 10
  );
}

/** Split a `Dialogue:` line into the prefix and the Text field by comma count. */
function splitAtTextField(line: string, textIndex: number): { prefix: string; text: string } {
  let commas = 0;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === ",") {
      commas++;
      if (commas === textIndex) {
        return { prefix: line.slice(0, i + 1), text: line.slice(i + 1) };
      }
    }
  }
  return { prefix: line, text: "" };
}

export function parseAss(input: string): ParsedSubtitle {
  const eol = input.includes("\r\n") ? "\r\n" : "\n";
  const hasTrailingNewline = /\r?\n$/.test(input);

  const normalized = input.replace(/\r\n/g, "\n");
  const body = normalized.replace(/\n$/, "");
  const rawLines = body.length ? body.split("\n") : [];

  let section = "";
  let fields = new Map<string, number>();
  let textIndex = 9; // sensible default for V4+ (…, Effect, Text)
  let ordinal = 0;

  const entries: LineEntry[] = rawLines.map((raw) => {
    const trimmed = raw.trim();

    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      section = trimmed.toLowerCase();
      return { raw };
    }

    if (section === "[events]" && /^format\s*:/i.test(trimmed)) {
      fields = parseFormatFields(trimmed);
      textIndex = fields.get("text") ?? fields.size - 1;
      return { raw };
    }

    // Only Dialogue lines are translated; Comment lines are left untouched.
    if (section === "[events]" && /^dialogue\s*:/i.test(trimmed)) {
      const { prefix, text } = splitAtTextField(raw, textIndex);
      const cue: Cue = { id: String(ordinal++), text };
      // Fields before Text never contain commas, so a naive split is safe here.
      const cols = raw.slice(raw.indexOf(":") + 1).split(",");
      const at = (name: string) => {
        const i = fields.get(name);
        return i !== undefined ? cols[i]?.trim() : undefined;
      };
      const start = parseAssTime(at("start") ?? "");
      const end = parseAssTime(at("end") ?? "");
      const speaker = at("name");
      if (start !== undefined) cue.start = start;
      if (end !== undefined) cue.end = end;
      if (speaker) cue.speaker = speaker;
      return { raw, prefix, cue };
    }

    return { raw };
  });

  return {
    format: "ass",
    cues: entries.filter((e): e is Required<LineEntry> => !!e.cue).map((e) => e.cue),
    serialize(): string {
      const out = entries
        .map((e) => (e.cue ? e.prefix! + e.cue.text : e.raw))
        .join(eol);
      return out + (hasTrailingNewline ? eol : "");
    },
  };
}
