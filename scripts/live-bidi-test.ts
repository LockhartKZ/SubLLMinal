// Manual end-to-end check for the RTL bidi fix against a real local LLM.
//   npx vite-node scripts/live-bidi-test.ts
// Env overrides: LLM_URL, LLM_MODEL
// Translates chess-notation lines (English text + Latin tokens like H1/Nf3) to
// Arabic twice — once with the fix off (rtl:false) and once on (rtl:true) — and
// shows that the fix wraps each line in RLE…PDF and pins each Latin run in LRE…PDF.
import { mkdirSync, writeFileSync } from "node:fs";
import { parseSrt } from "../src/lib/subtitle/srt";
import { LlmClient } from "../src/lib/llm/client";
import { translateCues } from "../src/lib/translate/engine";
import { RLE, LRE, PDF } from "../src/lib/translate/bidi";

const baseUrl = process.env.LLM_URL ?? "http://127.0.0.1:1234/v1";
const model = process.env.LLM_MODEL ?? "google/gemma-4-e4b";
const client = new LlmClient({ baseUrl, model, temperature: 0.2 }, fetch);

const SRT = `1
00:00:01,000 --> 00:00:04,000
h1 is covered, so move the knight to f3.

2
00:00:05,000 --> 00:00:08,000
Rook to h1, then queen to h6.

3
00:00:09,000 --> 00:00:12,000
The grandmaster opened with Nf3 and e2-e4.

4
00:00:13,000 --> 00:00:16,000
Mr Smith resigned after move 30.
`;

const NOTE =
  "Chess film. Keep algebraic chess notation (H1, H6, Nf3, e2-e4) and Latin names exactly as written in Latin letters; do not translate or transliterate them.";

/** Make the invisible embedding controls visible for the console. */
const vis = (s: string) =>
  s.replaceAll(RLE, "⟪RLE⟫").replaceAll(LRE, "⟪LRE⟫").replaceAll(PDF, "⟪PDF⟫");

/** Pull out exactly what each LRE…PDF embedding wraps, to prove we pinned the right runs. */
function isolatedRuns(s: string): string[] {
  const re = new RegExp(`${LRE}(.*?)${PDF}`, "g");
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) out.push(m[1]);
  return out;
}

async function translateCopy(rtl: boolean) {
  const parsed = parseSrt(SRT);
  await translateCues({
    cues: parsed.cues,
    backend: client,
    sourceName: "English",
    targetName: "Arabic",
    contextNote: NOTE,
    batchSize: 10,
    contextLines: 6,
    rtl,
  });
  return parsed;
}

console.log(`Model: ${model}\nEndpoint: ${baseUrl}\n`);

const raw = await translateCopy(false);
console.log("=== rtl:false — raw model output (Latin runs left bare → bidi can scramble) ===");
raw.cues.forEach((c, i) => console.log(`  [${i}] ${vis(c.text)}`));

const fixed = await translateCopy(true);
console.log("\n=== rtl:true — with RTL embedding fix (RLE…PDF line, LRE…PDF runs) ===");
fixed.cues.forEach((c, i) => console.log(`  [${i}] ${vis(c.text)}`));

console.log("\n=== proof: substrings each LRE…PDF embedding pins ===");
fixed.cues.forEach((c, i) => console.log(`  [${i}] ${JSON.stringify(isolatedRuns(c.text))}`));

mkdirSync("tmp", { recursive: true });
writeFileSync("tmp/chess.ar.raw.srt", raw.serialize(), "utf8");
writeFileSync("tmp/chess.ar.fixed.srt", fixed.serialize(), "utf8");
console.log("\nSaved tmp/chess.ar.raw.srt and tmp/chess.ar.fixed.srt — open both in mpv/VLC to compare.");
console.log("Done.");
