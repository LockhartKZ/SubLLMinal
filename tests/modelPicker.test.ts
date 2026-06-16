import { describe, it, expect } from "vitest";
import {
  filterModels,
  moveHighlight,
  shouldDiscoverModels,
  visibleOptions,
} from "../src/lib/ui/modelPicker";

// The model field is a custom combobox: a free-text input plus a dropdown we
// render ourselves (no native <datalist>/autofill, so it shows ONLY the models
// the current endpoint serves). These pure helpers drive what the menu shows
// and which row is highlighted; the DOM wiring in main.ts is a thin shell.
describe("model picker — menu filtering", () => {
  const models = ["deepseek-v4-flash", "deepseek-v4-pro", "google/gemma-4-e4b"];

  it("shows every model when the query is empty or whitespace", () => {
    expect(filterModels(models, "")).toEqual(models);
    expect(filterModels(models, "   ")).toEqual(models);
  });

  it("filters by case-insensitive substring", () => {
    expect(filterModels(models, "PRO")).toEqual(["deepseek-v4-pro"]);
    expect(filterModels(models, "deepseek")).toEqual([
      "deepseek-v4-flash",
      "deepseek-v4-pro",
    ]);
  });

  it("returns an empty list when nothing matches", () => {
    expect(filterModels(models, "llama")).toEqual([]);
  });

  it("drops duplicate ids so the menu never repeats a model", () => {
    expect(filterModels(["a", "a", "b"], "")).toEqual(["a", "b"]);
  });
});

describe("model picker — what the open menu shows", () => {
  const models = ["deepseek-v4-flash", "deepseek-v4-pro"];

  it("shows every model when the menu is opened, even if the field holds one exact id", () => {
    // Regression: after auto-pick the input holds 'deepseek-v4-pro'; opening the
    // menu must still list both models, not filter down to the selected one.
    expect(visibleOptions(models, "deepseek-v4-pro", false)).toEqual(models);
    expect(visibleOptions(models, "", false)).toEqual(models);
  });

  it("filters by the field text only once the user is typing", () => {
    expect(visibleOptions(models, "pro", true)).toEqual(["deepseek-v4-pro"]);
    expect(visibleOptions(models, "flash", true)).toEqual(["deepseek-v4-flash"]);
  });
});

describe("model picker — when to probe for models", () => {
  // Local servers need no key, so probe them on select/launch. Key-gated cloud
  // endpoints must NOT be probed until a key exists: otherwise every provider
  // switch 401s and (the bug) the previous provider's models keep showing.
  it("always probes a no-key (local) endpoint", () => {
    expect(shouldDiscoverModels({ needsKey: false, apiKey: "" })).toBe(true);
    expect(shouldDiscoverModels({ needsKey: false, apiKey: "anything" })).toBe(true);
  });

  it("does not probe a key-gated endpoint until a key is entered", () => {
    expect(shouldDiscoverModels({ needsKey: true, apiKey: "" })).toBe(false);
    expect(shouldDiscoverModels({ needsKey: true, apiKey: "   " })).toBe(false);
  });

  it("probes a key-gated endpoint once a non-blank key is present", () => {
    expect(shouldDiscoverModels({ needsKey: true, apiKey: "sk-123" })).toBe(true);
  });
});

describe("model picker — keyboard highlight", () => {
  it("moves down and up within range", () => {
    expect(moveHighlight(3, -1, +1)).toBe(0); // nothing highlighted yet -> first
    expect(moveHighlight(3, 0, +1)).toBe(1);
    expect(moveHighlight(3, 1, -1)).toBe(0);
  });

  it("wraps around both ends", () => {
    expect(moveHighlight(3, 2, +1)).toBe(0);
    expect(moveHighlight(3, 0, -1)).toBe(2);
  });

  it("returns -1 when the menu is empty", () => {
    expect(moveHighlight(0, -1, +1)).toBe(-1);
  });
});
