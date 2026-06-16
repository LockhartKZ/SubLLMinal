import { describe, it, expect } from "vitest";
import { TONE_OPTIONS, toneInstruction } from "../src/lib/translate/tone";

describe("tone", () => {
  it("offers Default first with an empty (no-op) instruction", () => {
    expect(TONE_OPTIONS[0].id).toBe("default");
    expect(TONE_OPTIONS[0].instruction).toBe("");
  });

  it("every non-default option carries a non-empty instruction and a label", () => {
    for (const t of TONE_OPTIONS.filter((o) => o.id !== "default")) {
      expect(t.instruction.trim().length).toBeGreaterThan(0);
      expect(t.label.trim().length).toBeGreaterThan(0);
    }
  });

  it("resolves a known id to its instruction", () => {
    expect(toneInstruction("formal").toLowerCase()).toContain("formal");
    expect(toneInstruction("informal").toLowerCase()).toContain("informal");
  });

  it("resolves default and unknown ids to the empty string", () => {
    expect(toneInstruction("default")).toBe("");
    expect(toneInstruction("nonsense")).toBe("");
    expect(toneInstruction("")).toBe("");
  });
});
