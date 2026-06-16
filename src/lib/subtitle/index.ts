import { parseSrt } from "./srt";
import { parseAss } from "./ass";
import type { ParsedSubtitle, SubtitleFormat } from "./types";

export function parseSubtitle(content: string, format: SubtitleFormat): ParsedSubtitle {
  return format === "srt" ? parseSrt(content) : parseAss(content);
}

export * from "./types";
export * from "./tags";
export { parseSrt, parseAss };
