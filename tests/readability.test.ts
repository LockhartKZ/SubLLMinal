import { describe, it, expect } from "vitest";
import { assessReadability, visibleLines, DEFAULT_LIMITS } from "../src/lib/subtitle/readability";
import { RLE, PDF, LRE } from "../src/lib/translate/bidi";
import type { Cue } from "../src/lib/subtitle/types";

const cue = (text: string, start?: number, end?: number): Cue => ({ id: "0", text, start, end });

describe("visibleLines", () => {
  it("strips ASS override blocks and HTML tags", () => {
    expect(visibleLines("{\\i1}Hello{\\i0}")).toEqual(["Hello"]);
    expect(visibleLines("<i>Hi there</i>")).toEqual(["Hi there"]);
  });

  it("splits on \\N, soft \\n, and real newlines", () => {
    expect(visibleLines("Line one\\NLine two")).toEqual(["Line one", "Line two"]);
    expect(visibleLines("a\nb")).toEqual(["a", "b"]);
  });

  it("strips directional control characters", () => {
    expect(visibleLines(`${RLE}مرحبا ${LRE}H1${PDF}${PDF}`)).toEqual(["مرحبا H1"]);
  });

  it("turns the ASS hard space \\h into a normal space", () => {
    expect(visibleLines("a\\hb")).toEqual(["a b"]);
  });
});

describe("assessReadability", () => {
  it("computes CPS from the cue duration over visible characters", () => {
    const r = assessReadability(cue("Hello there", 0, 1000)); // 11 chars / 1s
    expect(r.chars).toBe(11);
    expect(r.seconds).toBe(1);
    expect(r.cps).toBeCloseTo(11);
    expect(r.tooFast).toBe(false);
  });

  it("flags lines that read too fast", () => {
    const r = assessReadability(cue("This line is far too long to read in time", 0, 1000));
    expect(r.cps! > DEFAULT_LIMITS.maxCps).toBe(true);
    expect(r.tooFast).toBe(true);
    expect(r.ok).toBe(false);
  });

  it("does not count markup toward the character total", () => {
    const r = assessReadability(cue("{\\i1}Hello{\\i0}", 0, 2000));
    expect(r.chars).toBe(5);
  });

  it("counts visual lines and per-line length, flagging too many lines", () => {
    const r = assessReadability(cue("aa\\Nbb\\Ncc", 0, 3000));
    expect(r.lineCount).toBe(3);
    expect(r.lineLengths).toEqual([2, 2, 2]);
    expect(r.tooManyLines).toBe(true);
  });

  it("flags an over-long line", () => {
    const long = "x".repeat(50);
    const r = assessReadability(cue(long, 0, 5000));
    expect(r.longestLine).toBe(50);
    expect(r.lineTooLong).toBe(true);
  });

  it("counts code points, not UTF-16 units (emoji/CJK)", () => {
    const r = assessReadability(cue("😀😀", 0, 1000));
    expect(r.chars).toBe(2);
  });

  it("leaves CPS undefined when timing is missing or non-positive", () => {
    expect(assessReadability(cue("hi")).cps).toBeUndefined();
    expect(assessReadability(cue("hi", 1000, 1000)).cps).toBeUndefined();
    expect(assessReadability(cue("hi", 2000, 1000)).cps).toBeUndefined();
    // length/line checks still run without timing
    expect(assessReadability(cue("hi")).tooFast).toBe(false);
  });

  it("ignores bidi controls when counting characters", () => {
    const r = assessReadability(cue(`${RLE}مرحبا${PDF}`, 0, 1000));
    expect(r.chars).toBe(5);
  });
});
