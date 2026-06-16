export type SubtitleFormat = "srt" | "ass";

/**
 * A single translatable unit (one SRT cue or one ASS Dialogue line).
 *
 * `text` holds ONLY the translatable content:
 *  - SRT: the cue's display text, with internal line breaks as "\n".
 *  - ASS: the Dialogue `Text` field verbatim (override tags like `{\i1}` and
 *    `\N` breaks are still inside it; they are masked later by the engine).
 *
 * The engine mutates `text` in place, replacing the source with the translation.
 */
export interface Cue {
  /** Stable id, unique within the file (a stringified ordinal). */
  id: string;
  text: string;
  /** Read-only timing metadata in milliseconds, when the format provides it. */
  start?: number;
  end?: number;
  /** Speaker / actor name (ASS `Name` field), when present. */
  speaker?: string;
}

/**
 * The result of parsing a subtitle file: the list of translatable cues plus a
 * serializer that rebuilds the file from the cues' *current* text.
 *
 * Invariant: if no cue text is changed, `serialize()` reproduces the original
 * input byte-for-byte (for well-formed input). Everything that is not a cue —
 * timestamps, indices, ASS headers/styles, Comment lines — is preserved exactly.
 */
export interface ParsedSubtitle {
  format: SubtitleFormat;
  cues: Cue[];
  serialize(): string;
}

/** Detect the format from a file name/extension. */
export function formatFromName(name: string): SubtitleFormat | null {
  const lower = name.toLowerCase();
  if (lower.endsWith(".srt")) return "srt";
  if (lower.endsWith(".ass") || lower.endsWith(".ssa")) return "ass";
  return null;
}
