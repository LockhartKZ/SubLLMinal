/**
 * Reading-speed (CPS) and line-length checks for a translated cue.
 *
 * These are quality *warnings*, not edits: they never change the text. The UI
 * surfaces a flag on a preview row so the user can shorten a subtitle that is
 * too fast to read or too wide for the screen.
 *
 * Characters are counted on the *visible* text — markup (`{\\i1}`, `<i>`), line
 * breaks (`\\N`, `\\n`, real newlines) and the directional controls we add for
 * RTL (`bidi.ts`) are all excluded — and counted as Unicode code points, so CJK
 * and emoji count as one each. CPS uses the cue's `start`/`end` timing.
 *
 * Defaults follow the common Netflix Latin-script spec (17 cps, 42 chars/line,
 * 2 lines); they are passed in so they can be made configurable later.
 */
import type { Cue } from "./types";

export interface ReadabilityLimits {
  /** Maximum characters per second before a line is "too fast". */
  maxCps: number;
  /** Maximum code points on a single visual line. */
  maxLineLength: number;
  /** Maximum number of visual lines. */
  maxLines: number;
}

export const DEFAULT_LIMITS: ReadabilityLimits = {
  maxCps: 17,
  maxLineLength: 42,
  maxLines: 2,
};

export interface CueReadability {
  /** Visible code points across all lines (excludes markup/breaks/controls). */
  chars: number;
  /** Cue duration in seconds, or undefined when timing is missing/non-positive. */
  seconds?: number;
  /** Characters per second, or undefined when duration is unavailable. */
  cps?: number;
  /** Code-point length of each visual line. */
  lineLengths: number[];
  /** Longest single line (0 for an empty cue). */
  longestLine: number;
  /** Number of visual lines. */
  lineCount: number;
  tooFast: boolean;
  lineTooLong: boolean;
  tooManyLines: boolean;
  /** True when no limit is exceeded. */
  ok: boolean;
}

// Directional controls we (or an older version) may have added for RTL output.
const BIDI_CONTROLS = /[‪-‮⁦-⁩‎‏]/g;
const OVERRIDE = /\{[^}]*\}/g; // ASS override block, e.g. {\i1}
const HTML = /<\/?[^>\n]+>/g; // <i>, </i>, <font ...>
const HARD_SPACE = /\\h/g; // ASS hard space → reads as a normal space
const LINE_BREAK = /\\N|\\n|\r\n|\n/; // visual line breaks (ASS hard/soft + real)

/** Visible text of a cue, one trimmed string per rendered line. */
export function visibleLines(text: string): string[] {
  return text
    .replace(BIDI_CONTROLS, "")
    .split(LINE_BREAK)
    .map((line) => line.replace(OVERRIDE, "").replace(HTML, "").replace(HARD_SPACE, " ").trim());
}

function codePoints(s: string): number {
  return [...s].length;
}

export function assessReadability(cue: Cue, limits: ReadabilityLimits = DEFAULT_LIMITS): CueReadability {
  const lines = visibleLines(cue.text).filter((l) => l.length > 0);
  const lineLengths = lines.map(codePoints);
  const chars = lineLengths.reduce((a, b) => a + b, 0);
  const lineCount = lines.length;
  const longestLine = lineLengths.length ? Math.max(...lineLengths) : 0;

  let seconds: number | undefined;
  let cps: number | undefined;
  if (cue.start !== undefined && cue.end !== undefined) {
    const dur = (cue.end - cue.start) / 1000;
    if (dur > 0) {
      seconds = dur;
      cps = chars / dur;
    }
  }

  const tooFast = cps !== undefined && cps > limits.maxCps;
  const lineTooLong = longestLine > limits.maxLineLength;
  const tooManyLines = lineCount > limits.maxLines;

  return {
    chars,
    seconds,
    cps,
    lineLengths,
    longestLine,
    lineCount,
    tooFast,
    lineTooLong,
    tooManyLines,
    ok: !(tooFast || lineTooLong || tooManyLines),
  };
}
