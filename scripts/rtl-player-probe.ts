// Generates a single .srt that encodes ONE Arabic line (with embedded Latin
// chess squares) six different ways, so a human can open it in VLC / MPC-HC and
// report which encoding renders correctly and box-free. Run:
//   npx vite-node scripts/rtl-player-probe.ts
import { writeFileSync } from "node:fs";

// Control characters (with their code points, for the legend).
const RLM = "‏"; // RIGHT-TO-LEFT MARK
const LRM = "‎"; // LEFT-TO-RIGHT MARK
const RLE = "‫"; // RIGHT-TO-LEFT EMBEDDING
const LRE = "‪"; // LEFT-TO-RIGHT EMBEDDING
const PDF = "‬"; // POP DIRECTIONAL FORMATTING
const LRI = "⁦"; // LEFT-TO-RIGHT ISOLATE (boxes on MPC-HC — included to confirm)
const PDI = "⁩"; // POP DIRECTIONAL ISOLATE

// Canonical LOGICAL order (correct): "the queen on H1, the rook on H6, the pawn takes".
const base = "الملكة في H1، الرخ في H6، البيدق يأخذ";
const RUN = /[A-Za-z][A-Za-z0-9]*/g; // a Latin-letter run: H1, H6

const wrapRuns = (open: string, close: string) => base.replace(RUN, (r) => open + r + close);
const afterRuns = (mark: string) => base.replace(RUN, (r) => r + mark);

const variants: Array<[string, string]> = [
  ["1 RAW (no controls — baseline)", base],
  ["2 RLM at line start (force RTL base)", RLM + base],
  ["3 RLE…PDF wrap (Subtitle Edit style)", RLE + base + PDF],
  ["4 RLM start + RLM after each Latin run", RLM + afterRuns(RLM)],
  ["5 RLE wrap + each run in LRE…PDF", RLE + wrapRuns(LRE, PDF) + PDF],
  ["6 RLM start + each run in LRM…LRM", RLM + wrapRuns(LRM, LRM)],
  ["7 isolates LRI…PDI (expect boxes on MPC-HC)", wrapRuns(LRI, PDI)],
];

let srt = "";
variants.forEach(([label, text], i) => {
  const start = i * 4;
  const end = start + 3;
  const ts = (s: number) => `00:00:${String(s).padStart(2, "0")},000`;
  srt += `${i + 1}\n${ts(start)} --> ${ts(end)}\n${text}\n\n`;
  console.log(`Sub ${label}`);
});

writeFileSync("RTL-player-probe.ar.srt", srt, "utf8");
console.log("\nWrote RTL-player-probe.ar.srt  (open in VLC and MPC-HC)");
