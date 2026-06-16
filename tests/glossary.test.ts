import { describe, it, expect } from "vitest";
import { parseGlossary } from "../src/lib/translate/glossary";

describe("parseGlossary", () => {
  it("parses `source = target` lines", () => {
    const g = parseGlossary("grandmaster = أستاذ كبير\nKasparov = كاسباروف");
    expect(g).toEqual([
      { source: "grandmaster", target: "أستاذ كبير" },
      { source: "Kasparov", target: "كاسباروف" },
    ]);
  });

  it("accepts the `=>` separator too", () => {
    const g = parseGlossary("Nf3 => ن ف٣");
    expect(g).toEqual([{ source: "Nf3", target: "ن ف٣" }]);
  });

  it("splits on the first separator only (target may contain `=`)", () => {
    const g = parseGlossary("E = mc² = الطاقة");
    expect(g).toEqual([{ source: "E", target: "mc² = الطاقة" }]);
  });

  it("skips blank lines, comments, and lines with no separator", () => {
    const g = parseGlossary("# a comment\n\nfoo\n  \nbishop = فيل");
    expect(g).toEqual([{ source: "bishop", target: "فيل" }]);
  });

  it("trims whitespace and drops entries with an empty side", () => {
    const g = parseGlossary("  rook  =  قلعة  \nempty =   \n  = nothing");
    expect(g).toEqual([{ source: "rook", target: "قلعة" }]);
  });

  it("returns an empty array for empty or whitespace-only input", () => {
    expect(parseGlossary("")).toEqual([]);
    expect(parseGlossary("   \n  \n")).toEqual([]);
  });
});
