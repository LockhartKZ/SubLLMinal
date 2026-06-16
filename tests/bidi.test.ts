import { describe, it, expect } from "vitest";
import { embedLtrRuns, fixRtlLine, fixRtlMasked, RLE, LRE, PDF } from "../src/lib/translate/bidi";

/** Pin helper: how a single Latin run looks once embedded. */
const e = (s: string) => `${LRE}${s}${PDF}`;
/** Whole-line helper: RTL embedding around an already-pinned line body. */
const line = (body: string) => `${RLE}${body}${PDF}`;

describe("embedLtrRuns", () => {
  it("pins each Latin run in an LTR embedding", () => {
    expect(embedLtrRuns(`القلعة إلى H1`)).toBe(`القلعة إلى ${e("H1")}`);
    expect(embedLtrRuns(`H1، إلى H6`)).toBe(`${e("H1")}، إلى ${e("H6")}`);
  });

  it("keeps an LTR phrase and in-word punctuation together as one run", () => {
    expect(embedLtrRuns(`قال Mr Smith`)).toBe(`قال ${e("Mr Smith")}`);
    expect(embedLtrRuns(`افتح e2-e4`)).toBe(`افتح ${e("e2-e4")}`);
  });

  it("leaves bare numbers and pure-RTL text untouched", () => {
    expect(embedLtrRuns(`الفصل 2026 هنا`)).toBe(`الفصل 2026 هنا`);
    expect(embedLtrRuns(`مرحبا بالعالم`)).toBe(`مرحبا بالعالم`);
  });
});

describe("fixRtlLine", () => {
  it("wraps a Latin-containing line in an RTL embedding and pins its runs", () => {
    expect(fixRtlLine(`الملكة في H1`)).toBe(line(`الملكة في ${e("H1")}`));
  });

  it("fixes a line that starts with a Latin run (would otherwise flip to LTR)", () => {
    expect(fixRtlLine(`h1 مغطى`)).toBe(line(`${e("h1")} مغطى`));
  });

  it("leaves a pure-RTL line untouched (no controls)", () => {
    expect(fixRtlLine(`مرحبا بالعالم`)).toBe(`مرحبا بالعالم`);
  });

  it("leaves a line whose only non-RTL content is a bare number untouched", () => {
    expect(fixRtlLine(`النقلة 30`)).toBe(`النقلة 30`);
  });

  it("is idempotent — re-applying does not stack embeddings", () => {
    const once = fixRtlLine(`الملكة في H1`);
    expect(fixRtlLine(once)).toBe(once);
  });
});

describe("fixRtlMasked — per visual line, respecting markup tokens", () => {
  it("embeds each line of a 2-line cue independently (break token stays outside)", () => {
    // ⟦0⟧ is a hard break (\N). Each visual line gets its own RTL embedding.
    const masked = `h1 مغطى⟦0⟧الملكة إلى h6`;
    const map = ["\\N"];
    expect(fixRtlMasked(masked, map)).toBe(
      `${line(`${e("h1")} مغطى`)}⟦0⟧${line(`الملكة إلى ${e("h6")}`)}`,
    );
  });

  it("never treats Latin inside a non-break markup token as text", () => {
    // ⟦0⟧ = {\i1}, ⟦1⟧ = {\i0}: tags stay tokens, only h1 is pinned.
    const masked = `⟦0⟧الملكة إلى h1⟦1⟧`;
    const map = ["{\\i1}", "{\\i0}"];
    expect(fixRtlMasked(masked, map)).toBe(line(`⟦0⟧الملكة إلى ${e("h1")}⟦1⟧`));
  });

  it("leaves a pure-RTL cue completely untouched", () => {
    expect(fixRtlMasked(`مرحبا بالعالم`, [])).toBe(`مرحبا بالعالم`);
  });
});
