// Manual end-to-end check against a real local LLM. Run with:
//   npx vite-node scripts/live-translate.ts
// Env overrides: LLM_URL, LLM_MODEL, TARGET
import { readFileSync, writeFileSync } from "node:fs";
import { parseSrt } from "../src/lib/subtitle/srt";
import { parseAss } from "../src/lib/subtitle/ass";
import { LlmClient } from "../src/lib/llm/client";
import { translateCues } from "../src/lib/translate/engine";

const baseUrl = process.env.LLM_URL ?? "http://127.0.0.1:1234/v1";
const model = process.env.LLM_MODEL ?? "google/gemma-4-e4b";
const targetName = process.env.TARGET ?? "Arabic";

const client = new LlmClient({ baseUrl, model, temperature: 0.2 }, fetch);

async function run(label: string, srcPath: string, outPath: string, parse: (s: string) => ReturnType<typeof parseSrt>) {
  const src = readFileSync(srcPath, "utf8");
  const parsed = parse(src);
  const originals = parsed.cues.map((c) => c.text);
  console.log(`\n=== ${label}: ${parsed.cues.length} cues -> ${targetName} (${model}) ===`);
  await translateCues({
    cues: parsed.cues,
    backend: client,
    sourceName: "English",
    targetName,
    batchSize: 10,
    contextLines: 6,
    onProgress: (d, t) => process.stdout.write(`\r  progress ${d}/${t}   `),
  });
  console.log("\n");
  parsed.cues.forEach((c, i) => {
    console.log(`  [${i}] ${JSON.stringify(originals[i])}`);
    console.log(`      -> ${JSON.stringify(c.text)}`);
  });
  writeFileSync(outPath, parsed.serialize(), "utf8");
  console.log(`  saved: ${outPath}`);
}

await run("SRT", "tests/fixtures/sample.srt", "tests/fixtures/sample.ar.srt", parseSrt);
await run("ASS", "tests/fixtures/sample.ass", "tests/fixtures/sample.ar.ass", parseAss);
console.log("\nDone.");
