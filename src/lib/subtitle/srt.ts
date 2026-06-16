import type { Cue, ParsedSubtitle } from "./types";

/**
 * SubRip (.srt) parser/serializer.
 *
 * A block is: an index line, a `HH:MM:SS,mmm --> HH:MM:SS,mmm` timing line, and
 * one or more text lines. We keep the index and timing verbatim and expose only
 * the text (internal breaks as "\n") as a translatable cue.
 */

interface SrtBlock {
  index: string;
  timing: string;
  cue: Cue;
}

/** `HH:MM:SS,mmm` (or with a dot) -> milliseconds. */
function parseSrtTime(t: string): number | undefined {
  const m = /(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})/.exec(t.trim());
  if (!m) return undefined;
  return (
    Number(m[1]) * 3_600_000 +
    Number(m[2]) * 60_000 +
    Number(m[3]) * 1_000 +
    Number(m[4].padEnd(3, "0"))
  );
}

export function parseSrt(input: string): ParsedSubtitle {
  const eol = input.includes("\r\n") ? "\r\n" : "\n";
  const hasTrailingNewline = /\r?\n$/.test(input);

  // Work in normalized "\n" space; restore `eol` on serialize.
  const normalized = input.replace(/\r\n/g, "\n");
  const body = normalized.replace(/\n+$/, ""); // strip trailing blank lines for parsing
  const chunks = body.length ? body.split(/\n\n+/) : [];

  const blocks: SrtBlock[] = chunks.map((chunk, i) => {
    const lines = chunk.split("\n");
    const index = lines[0] ?? String(i + 1);
    const timing = lines[1] ?? "";
    const text = lines.slice(2).join("\n");
    const [rawStart, rawEnd] = timing.split("-->");
    const cue: Cue = { id: String(i), text };
    const start = rawStart ? parseSrtTime(rawStart) : undefined;
    const end = rawEnd ? parseSrtTime(rawEnd) : undefined;
    if (start !== undefined) cue.start = start;
    if (end !== undefined) cue.end = end;
    return { index, timing, cue };
  });

  return {
    format: "srt",
    cues: blocks.map((b) => b.cue),
    serialize(): string {
      const out = blocks
        .map((b) => [b.index, b.timing, ...b.cue.text.split("\n")].join(eol))
        .join(eol + eol);
      return out + (hasTrailingNewline ? eol : "");
    },
  };
}
