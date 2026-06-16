// Diagnostic: dump the EXACT logical codepoint order the model emits for chess
// lines, with no bidi processing, so we can tell a model mis-placement from a
// renderer bidi reorder.  Run: npx vite-node scripts/diag-rtl.ts
import { LlmClient } from "../src/lib/llm/client";

const baseUrl = process.env.LLM_URL ?? "http://127.0.0.1:1234/v1";
const model = process.env.LLM_MODEL ?? "google/gemma-4-e4b";
const client = new LlmClient({ baseUrl, model, temperature: 0.2 }, fetch);

const LINES = [
  "The queen goes to h1, the rook to h6, the pawn takes.",
  "Rook to h1, queen to h6.",
  "h1 is covered, move the knight to f3.",
];

const sys =
  "You are a professional subtitle translator. Translate the user's English line into Arabic. " +
  "Keep chess square names like h1, h6, f3 exactly as Latin lowercase letters+digits, in the same " +
  "position relative to the words as in English. Reply with ONLY the Arabic translation, nothing else.";

function dump(label: string, s: string) {
  console.log(`\n${label}: ${JSON.stringify(s)}`);
  // Show each char with its codepoint, marking Latin runs and any control chars.
  const parts = [...s].map((ch) => {
    const cp = ch.codePointAt(0)!;
    if (cp >= 0x2066 && cp <= 0x2069) return `<${cp.toString(16)}>`;
    if (cp === 0x200e || cp === 0x200f || (cp >= 0x202a && cp <= 0x202e)) return `<${cp.toString(16)}>`;
    if (/[A-Za-z0-9]/.test(ch)) return ch; // Latin run char
    return ch;
  });
  console.log("  chars:", parts.join(""));
}

for (const line of LINES) {
  const reply = await client.chat([
    { role: "system", content: sys },
    { role: "user", content: line },
  ]);
  dump("EN ", line);
  dump("AR ", reply.trim());
}
console.log("\nDone.");
