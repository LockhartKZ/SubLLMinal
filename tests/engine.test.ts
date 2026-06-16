import { describe, it, expect } from "vitest";
import type { ChatBackend, ChatMessage } from "../src/lib/llm/client";
import { parseTranslations } from "../src/lib/translate/prompt";
import { translateCues, reconcileTokens } from "../src/lib/translate/engine";
import { RLE, LRE, PDF } from "../src/lib/translate/bidi";

type Entry = { id: string; text: string };

/**
 * Mock LLM. It reads the `[[id]] text` lines from the user prompt (context
 * lines don't carry an [[id]] so they're ignored), "translates" each, and can
 * be told to misbehave on specific calls to exercise the recovery paths.
 */
class MockBackend implements ChatBackend {
  calls: ChatMessage[][] = [];
  constructor(
    private opts: {
      transform?: (s: string) => string;
      misbehave?: (entries: Entry[], callIndex: number) => Entry[];
    } = {},
  ) {}

  async chat(messages: ChatMessage[]): Promise<string> {
    const callIndex = this.calls.length;
    this.calls.push(messages);
    const user = messages[messages.length - 1].content;
    const transform = this.opts.transform ?? ((s) => s.toUpperCase());
    let entries: Entry[] = [...parseTranslations(user).entries()].map(([id, text]) => ({
      id,
      text: transform(text),
    }));
    if (this.opts.misbehave) entries = this.opts.misbehave(entries, callIndex);
    return entries.map((e) => `[[${e.id}]] ${e.text}`).join("\n");
  }
}

describe("translateCues", () => {
  it("translates a batch, preserves tags, skips non-translatable cues", async () => {
    const cues = [
      { id: "0", text: "hello" },
      { id: "1", text: "{\\i1}world{\\i0}" },
      { id: "2", text: "♪" },
    ];
    await translateCues({
      cues,
      backend: new MockBackend(),
      sourceName: "English",
      targetName: "Spanish",
    });
    expect(cues[0].text).toBe("HELLO");
    expect(cues[1].text).toBe("{\\i1}WORLD{\\i0}");
    expect(cues[2].text).toBe("♪");
  });

  it("reports progress up to total", async () => {
    const cues = [
      { id: "0", text: "a" },
      { id: "1", text: "b" },
      { id: "2", text: "♪" },
    ];
    const seen: Array<[number, number]> = [];
    await translateCues({
      cues,
      backend: new MockBackend(),
      sourceName: "English",
      targetName: "German",
      onProgress: (d, t) => seen.push([d, t]),
    });
    expect(seen.at(-1)).toEqual([3, 3]);
  });

  it("recovers when the model drops a line (retry)", async () => {
    const cues = [
      { id: "0", text: "alpha" },
      { id: "1", text: "bravo" },
      { id: "2", text: "charlie" },
    ];
    const backend = new MockBackend({
      misbehave: (entries, call) => (call === 0 ? entries.slice(0, -1) : entries),
    });
    await translateCues({
      cues,
      backend,
      sourceName: "English",
      targetName: "French",
      batchSize: 10,
      maxRetries: 2,
    });
    expect(cues.map((c) => c.text)).toEqual(["ALPHA", "BRAVO", "CHARLIE"]);
  });

  it("reconciles missing tokens via the single-line fallback", async () => {
    const cues = [{ id: "0", text: "{\\i1}hi{\\i0}" }];
    // This model always strips formatting tokens, so validation always fails.
    const backend = new MockBackend({
      transform: (s) => s.replace(/⟦\d+⟧/g, "").toUpperCase(),
    });
    await translateCues({
      cues,
      backend,
      sourceName: "English",
      targetName: "Arabic",
      batchSize: 10,
      maxRetries: 1,
    });
    expect(cues[0].text).toContain("{\\i1}");
    expect(cues[0].text).toContain("{\\i0}");
  });

  it("passes prior translations as context on later batches", async () => {
    const cues = [
      { id: "0", text: "line zero" },
      { id: "1", text: "line one" },
    ];
    const backend = new MockBackend();
    await translateCues({
      cues,
      backend,
      sourceName: "English",
      targetName: "French",
      batchSize: 1,
      contextLines: 6,
    });
    expect(backend.calls.length).toBe(2);
    expect(backend.calls[1][1].content).toContain("Already translated");
  });

  it("embeds LTR runs in an RTL embedding when the target is RTL", async () => {
    const cues = [{ id: "0", text: "go to H1" }];
    const backend = new MockBackend({ transform: (s) => s.replace("go to", "اذهب إلى") });
    await translateCues({
      cues,
      backend,
      sourceName: "English",
      targetName: "Arabic",
      rtl: true,
    });
    expect(cues[0].text).toBe(`${RLE}اذهب إلى ${LRE}H1${PDF}${PDF}`);
  });

  it("embeds only the visible LTR run, never the masked markup", async () => {
    const cues = [{ id: "0", text: "{\\i1}go to H1{\\i0}" }];
    const backend = new MockBackend({ transform: (s) => s.replace("go to", "اذهب إلى") });
    await translateCues({
      cues,
      backend,
      sourceName: "English",
      targetName: "Arabic",
      rtl: true,
    });
    // The {\i1}/{\i0} override tags must come back intact, inside the line embedding.
    expect(cues[0].text).toBe(`${RLE}{\\i1}اذهب إلى ${LRE}H1${PDF}{\\i0}${PDF}`);
  });

  it("forces RTL base direction when the line starts with a Latin run", async () => {
    const cues = [{ id: "0", text: "h1 is covered" }];
    const backend = new MockBackend({ transform: (s) => s.replace("is covered", "مغطى") });
    await translateCues({
      cues,
      backend,
      sourceName: "English",
      targetName: "Arabic",
      rtl: true,
    });
    // "h1 مغطى" starts with Latin; the RTL embedding keeps the player from flipping it.
    expect(cues[0].text).toBe(`${RLE}${LRE}h1${PDF} مغطى${PDF}`);
  });

  it("leaves LTR-target output untouched (no embeddings)", async () => {
    const cues = [{ id: "0", text: "go to H1" }];
    const backend = new MockBackend({ transform: (s) => s });
    await translateCues({
      cues,
      backend,
      sourceName: "English",
      targetName: "Spanish",
    });
    expect(cues[0].text).toBe("go to H1");
  });

  it("passes the glossary into every batch's system prompt", async () => {
    const cues = [{ id: "0", text: "the grandmaster moved" }];
    const backend = new MockBackend();
    await translateCues({
      cues,
      backend,
      sourceName: "English",
      targetName: "Arabic",
      glossary: [{ source: "grandmaster", target: "أستاذ كبير" }],
    });
    expect(backend.calls[0][0].role).toBe("system");
    expect(backend.calls[0][0].content).toContain("grandmaster => أستاذ كبير");
  });

  it("passes the tone instruction into the system prompt", async () => {
    const cues = [{ id: "0", text: "come here" }];
    const backend = new MockBackend();
    await translateCues({
      cues,
      backend,
      sourceName: "English",
      targetName: "French",
      tone: "formal",
    });
    expect(backend.calls[0][0].content).toContain("Tone and register:");
    expect(backend.calls[0][0].content.toLowerCase()).toContain("vous");
  });

  it("adds no tone line for the default (or unset) tone", async () => {
    const cues = [{ id: "0", text: "come here" }];
    const backend = new MockBackend();
    await translateCues({ cues, backend, sourceName: "English", targetName: "French" });
    expect(backend.calls[0][0].content).not.toContain("Tone and register:");
  });

  it("runs a refine pass that replaces the draft when the refinement validates", async () => {
    const cues = [{ id: "0", text: "hi" }];
    // Pass 1 (translator) uppercases; pass 2 (editor) returns an improved line.
    const backend: ChatBackend = {
      calls: 0,
      async chat(messages: ChatMessage[]) {
        this.calls++;
        const isRefine = messages[0].content.toLowerCase().includes("editor");
        return isRefine ? "[[0]] HI-REFINED" : "[[0]] HI";
      },
    } as ChatBackend & { calls: number };
    await translateCues({ cues, backend, sourceName: "English", targetName: "French", refine: true });
    expect(cues[0].text).toBe("HI-REFINED");
    expect((backend as unknown as { calls: number }).calls).toBe(2); // one translate + one refine
  });

  it("keeps the first-pass draft when the refinement breaks the token set", async () => {
    const cues = [{ id: "0", text: "{\\i1}hi{\\i0}" }];
    const backend: ChatBackend = {
      async chat(messages: ChatMessage[]) {
        const isRefine = messages[0].content.toLowerCase().includes("editor");
        // Refine drops the ⟦n⟧ tokens -> must be rejected, draft kept.
        if (isRefine) return "[[0]] BROKEN";
        const user = messages[messages.length - 1].content;
        const id = [...parseTranslations(user).keys()][0];
        const masked = [...parseTranslations(user).values()][0].toUpperCase();
        return `[[${id}]] ${masked}`;
      },
    };
    await translateCues({ cues, backend, sourceName: "English", targetName: "Arabic", refine: true });
    expect(cues[0].text).toBe("{\\i1}HI{\\i0}");
  });

  it("does not run a refine pass when refine is off", async () => {
    const cues = [{ id: "0", text: "hi" }];
    const backend = new MockBackend();
    await translateCues({ cues, backend, sourceName: "English", targetName: "French" });
    expect(backend.calls.length).toBe(1);
  });

  it("reports progress across both passes up to total", async () => {
    const cues = [
      { id: "0", text: "a" },
      { id: "1", text: "b" },
      { id: "2", text: "♪" },
    ];
    const seen: Array<[number, number]> = [];
    await translateCues({
      cues,
      backend: new MockBackend(),
      sourceName: "English",
      targetName: "German",
      refine: true,
      onProgress: (d, t) => seen.push([d, t]),
    });
    // total = 3 cues + 2 translatable refine units = 5
    expect(seen.at(-1)).toEqual([5, 5]);
  });

  it("rejects when the signal is already aborted", async () => {
    const ac = new AbortController();
    ac.abort();
    await expect(
      translateCues({
        cues: [{ id: "0", text: "x" }],
        backend: new MockBackend(),
        sourceName: "English",
        targetName: "Hebrew",
        signal: ac.signal,
      }),
    ).rejects.toThrow();
  });
});

describe("reconcileTokens", () => {
  it("appends missing tokens and drops unknown ones", () => {
    expect(reconcileTokens("⟦0⟧hi⟦1⟧", "HI")).toBe("HI⟦0⟧⟦1⟧");
    expect(reconcileTokens("⟦0⟧hi", "X⟦0⟧⟦5⟧")).toBe("X⟦0⟧");
  });
});
