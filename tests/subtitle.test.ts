import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseSrt } from "../src/lib/subtitle/srt";
import { parseAss } from "../src/lib/subtitle/ass";
import {
  maskTags,
  restoreTags,
  sameTokens,
  tokenIds,
  stripTokens,
  hasTranslatableText,
} from "../src/lib/subtitle/tags";

function fixture(name: string): string {
  return readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), "utf8");
}

describe("srt", () => {
  it("round-trips an unchanged file byte-for-byte", () => {
    const src = fixture("sample.srt");
    expect(parseSrt(src).serialize()).toBe(src);
  });

  it("extracts cue text without timing/index", () => {
    const p = parseSrt(fixture("sample.srt"));
    expect(p.cues.length).toBe(3);
    expect(p.cues[0].text).toBe("Hello, world!");
    expect(p.cues[1].text).toContain("Second line here.");
    expect(p.cues[2].text).toBe("♪");
  });

  it("reads timing metadata in milliseconds", () => {
    const p = parseSrt(fixture("sample.srt"));
    expect(p.cues[0].start).toBe(1000);
    expect(p.cues[0].end).toBe(4000);
    expect(p.cues[1].start).toBe(5000);
    expect(p.cues[1].end).toBe(8500);
  });

  it("applies translations while keeping timing", () => {
    const p = parseSrt(fixture("sample.srt"));
    p.cues[0].text = "Hola, mundo!";
    const out = p.serialize();
    expect(out).toContain("Hola, mundo!");
    expect(out).toContain("00:00:01,000 --> 00:00:04,000");
  });
});

describe("ass", () => {
  it("round-trips an unchanged file byte-for-byte", () => {
    const src = fixture("sample.ass");
    expect(parseAss(src).serialize()).toBe(src);
  });

  it("captures only Dialogue text and skips Comment lines", () => {
    const p = parseAss(fixture("sample.ass"));
    expect(p.cues.length).toBe(2);
    expect(p.cues[0].text).toBe("Hello, world!");
    expect(p.cues[1].text).toContain("{\\i1}");
    expect(p.cues[1].text).toContain("\\N");
  });

  it("reads timing metadata in milliseconds", () => {
    const p = parseAss(fixture("sample.ass"));
    expect(p.cues[0].start).toBe(1000);
    expect(p.cues[0].end).toBe(4000);
    expect(p.cues[1].start).toBe(5000);
    expect(p.cues[1].end).toBe(8500);
  });

  it("keeps headers/styles/comments after translation", () => {
    const p = parseAss(fixture("sample.ass"));
    p.cues[0].text = "Hola, mundo!";
    const out = p.serialize();
    expect(out).toContain("Hola, mundo!");
    expect(out).toContain("must not be translated");
    expect(out).toContain("[V4+ Styles]");
  });
});

describe("tags", () => {
  it("masks and restores ASS override tags and breaks", () => {
    const text = "{\\i1}Hello{\\i0} world\\Nsecond";
    const { masked, map } = maskTags(text);
    expect(hasTranslatableText(masked)).toBe(true);
    expect(masked).not.toContain("{");
    expect(masked).not.toContain("\\N");
    expect(restoreTags(masked, map)).toBe(text);
  });

  it("masks html-ish tags and real newlines", () => {
    const text = "This is <i>a test</i>\nsecond line";
    const { masked, map } = maskTags(text);
    expect(masked).not.toContain("<i>");
    expect(masked).not.toContain("\n");
    expect(restoreTags(masked, map)).toBe(text);
  });

  it("detects matching vs dropped token sets", () => {
    const masked = maskTags("{\\i1}Hi{\\i0}").masked; // ⟦0⟧Hi⟦1⟧
    const dropped = masked.replace("⟧Hi⟦1⟧", "⟧Hi"); // remove ⟦1⟧
    expect(tokenIds(masked)).toEqual([0, 1]);
    expect(sameTokens(masked, masked)).toBe(true);
    expect(sameTokens(masked, dropped)).toBe(false);
  });

  it("treats note-only text as non-translatable", () => {
    expect(hasTranslatableText(maskTags("♪").masked)).toBe(false);
  });

  it("strips tokens for building context", () => {
    const { masked } = maskTags("{\\i1}Hello{\\i0} world");
    expect(stripTokens(masked)).toBe("Hello world");
  });
});
