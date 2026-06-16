import { describe, expect, it } from "vitest";
import {
  DEFAULT_PRESET_ID,
  ENDPOINT_PRESETS,
  groupedPresets,
} from "../src/lib/llm/presets";

describe("endpoint presets", () => {
  it("gives every preset a known category", () => {
    for (const p of ENDPOINT_PRESETS) {
      expect(["local", "cloud", "custom"]).toContain(p.category);
    }
  });

  it("defaults to a local preset", () => {
    const def = ENDPOINT_PRESETS.find((p) => p.id === DEFAULT_PRESET_ID);
    expect(def?.category).toBe("local");
  });

  it("keeps the three known local endpoints", () => {
    const local = ENDPOINT_PRESETS.filter((p) => p.category === "local").map((p) => p.id);
    expect(local).toEqual(expect.arrayContaining(["lmstudio", "llamacpp", "ollama"]));
  });

  it("lists the named cloud providers", () => {
    const cloud = ENDPOINT_PRESETS.filter((p) => p.category === "cloud").map((p) => p.id);
    expect(cloud).toEqual(
      expect.arrayContaining([
        "openai",
        "anthropic",
        "deepseek",
        "minimax",
        "moonshot",
        "zai",
        "openrouter",
      ]),
    );
  });

  it("gives local presets an http localhost base URL", () => {
    for (const p of ENDPOINT_PRESETS.filter((p) => p.category === "local")) {
      expect(p.baseUrl).toMatch(/^http:\/\/(localhost|127\.0\.0\.1)/);
    }
  });

  it("gives every cloud preset a usable https base URL and asks for a key", () => {
    for (const p of ENDPOINT_PRESETS.filter((p) => p.category === "cloud")) {
      expect(p.needsKey).toBe(true);
      expect(p.baseUrl).toMatch(/^https:\/\//);
      // must be a parseable URL so the client can join "/chat/completions"
      expect(() => new URL(p.baseUrl)).not.toThrow();
    }
  });

  it("keeps a blank custom catch-all", () => {
    const custom = ENDPOINT_PRESETS.find((p) => p.category === "custom");
    expect(custom?.id).toBe("custom");
    expect(custom?.baseUrl).toBe("");
  });

  it("groups presets for the dropdown as Local then Cloud, custom trailing", () => {
    const groups = groupedPresets();
    const labelled = groups.filter((g) => g.label);
    expect(labelled.map((g) => g.label)).toEqual(["Local", "Cloud"]);

    // every preset appears exactly once across all groups
    const flat = groups.flatMap((g) => g.presets.map((p) => p.id));
    expect(flat.slice().sort()).toEqual(ENDPOINT_PRESETS.map((p) => p.id).slice().sort());

    // the custom catch-all sits in a trailing, unlabelled group
    const last = groups[groups.length - 1];
    expect(last.label).toBe("");
    expect(last.presets.map((p) => p.id)).toEqual(["custom"]);
  });
});
