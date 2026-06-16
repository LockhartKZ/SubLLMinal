import { describe, it, expect } from "vitest";
import { buildSystemPrompt, buildMessages, parseTranslations, buildRefineMessages } from "../src/lib/translate/prompt";
import { parseGlossary } from "../src/lib/translate/glossary";
import { toneInstruction } from "../src/lib/translate/tone";

describe("prompt", () => {
  it("injects glossary entries into the system prompt as source => target", () => {
    const glossary = parseGlossary("grandmaster = أستاذ كبير\nNf3 = ن ف٣");
    const sys = buildSystemPrompt("English", "Arabic", false, "", glossary);
    expect(sys).toContain("Glossary");
    expect(sys).toContain("grandmaster => أستاذ كبير");
    expect(sys).toContain("Nf3 => ن ف٣");
  });

  it("omits the glossary block when there are no entries", () => {
    const sys = buildSystemPrompt("English", "Arabic", false, "", []);
    expect(sys).not.toContain("Glossary");
  });

  it("forwards the glossary through buildMessages", () => {
    const glossary = parseGlossary("rook = قلعة");
    const msgs = buildMessages("English", "Arabic", [{ id: "0", masked: "Hello" }], [], false, "", glossary);
    expect(msgs[0].content).toContain("rook => قلعة");
  });

  it("injects a tone instruction into the system prompt", () => {
    const sys = buildSystemPrompt("English", "French", false, "", [], toneInstruction("formal"));
    expect(sys).toContain("Tone and register:");
    expect(sys.toLowerCase()).toContain("vous");
  });

  it("omits the tone line when the instruction is empty (Default)", () => {
    const sys = buildSystemPrompt("English", "French", false, "", [], toneInstruction("default"));
    expect(sys).not.toContain("Tone and register:");
  });

  it("forwards the tone instruction through buildMessages", () => {
    const msgs = buildMessages(
      "English", "French", [{ id: "0", masked: "Hello" }], [], false, "", [], toneInstruction("informal"),
    );
    expect(msgs[0].content).toContain("Tone and register:");
  });

  it("includes the context note in the system prompt when provided", () => {
    const sys = buildSystemPrompt("English", "Arabic", false, "A film about chess; keep terms like grandmaster.");
    expect(sys).toContain("grandmaster");
    expect(sys).toContain("Background about this material");
  });

  it("omits the context block when the note is blank", () => {
    const sys = buildSystemPrompt("English", "Arabic", false, "   ");
    expect(sys).not.toContain("Background about this material");
  });

  it("forwards the note through buildMessages into the system message", () => {
    const msgs = buildMessages("English", "Arabic", [{ id: "0", masked: "Hello" }], [], false, "chess movie");
    expect(msgs[0].role).toBe("system");
    expect(msgs[0].content).toContain("chess movie");
    expect(msgs[1].content).toContain("[[0]] Hello");
  });

  it("builds a refine prompt that frames the model as an editor over a draft", () => {
    const msgs = buildRefineMessages(
      "English", "Arabic", [{ id: "0", source: "hello ⟦0⟧", draft: "مرحبا ⟦0⟧" }], "", [], "",
    );
    expect(msgs[0].role).toBe("system");
    expect(msgs[0].content.toLowerCase()).toContain("editor");
    expect(msgs[0].content.toLowerCase()).toContain("draft");
    expect(msgs[1].content).toContain("[[0]]");
    expect(msgs[1].content).toContain("hello");
    expect(msgs[1].content).toContain("مرحبا");
  });

  it("carries glossary and tone into the refine system prompt", () => {
    const msgs = buildRefineMessages(
      "English", "Arabic", [{ id: "0", source: "a", draft: "ب" }],
      "", parseGlossary("rook = قلعة"), toneInstruction("formal"),
    );
    expect(msgs[0].content).toContain("rook => قلعة");
    expect(msgs[0].content).toContain("Tone and register:");
  });

  it("parses [[id]] lines into a map", () => {
    const m = parseTranslations("[[0]] hola\nnoise\n[[1]] mundo");
    expect(m.get("0")).toBe("hola");
    expect(m.get("1")).toBe("mundo");
  });
});
