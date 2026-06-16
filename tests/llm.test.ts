import { describe, it, expect } from "vitest";
import { LlmClient, reasoningEffortFor, type FetchLike } from "../src/lib/llm/client";

function fakeFetch(handler: (url: string, init: RequestInit) => Response): FetchLike {
  return (async (url: any, init: any) => handler(String(url), init ?? {})) as FetchLike;
}

describe("LlmClient", () => {
  it("posts to /chat/completions and returns the content", async () => {
    let url = "";
    let init: any = {};
    const client = new LlmClient(
      { baseUrl: "http://localhost:1234/v1/", model: "m", apiKey: "secret" },
      fakeFetch((u, i) => {
        url = u;
        init = i;
        return new Response(JSON.stringify({ choices: [{ message: { content: "hi" } }] }), {
          status: 200,
        });
      }),
    );
    const out = await client.chat([{ role: "user", content: "x" }]);
    expect(out).toBe("hi");
    expect(url).toBe("http://localhost:1234/v1/chat/completions");
    expect((init.headers as Record<string, string>)["Authorization"]).toBe("Bearer secret");
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe("m");
    expect(body.stream).toBe(false);
  });

  it("maps the toggle to an explicit reasoning effort (off = 'none')", () => {
    expect(reasoningEffortFor(true)).toBe("medium");
    // OFF must actively disable reasoning, not leave it to the model default.
    expect(reasoningEffortFor(false)).toBe("none");
  });

  it("sends reasoning_effort when configured, and omits it otherwise", async () => {
    const bodyFor = async (cfg: Record<string, unknown>) => {
      let body: any = {};
      const client = new LlmClient(
        { baseUrl: "http://x/v1", model: "m", ...cfg } as any,
        fakeFetch((_u, i) => {
          body = JSON.parse(i.body as string);
          return new Response(JSON.stringify({ choices: [{ message: { content: "z" } }] }), {
            status: 200,
          });
        }),
      );
      await client.chat([{ role: "user", content: "x" }]);
      return body;
    };

    expect((await bodyFor({ reasoningEffort: "medium" })).reasoning_effort).toBe("medium");
    expect("reasoning_effort" in (await bodyFor({}))).toBe(false);
  });

  it("omits Authorization when no key is set", async () => {
    let headers: Record<string, string> = {};
    const client = new LlmClient(
      { baseUrl: "http://x/v1", model: "m" },
      fakeFetch((_u, i) => {
        headers = i.headers as Record<string, string>;
        return new Response(JSON.stringify({ choices: [{ message: { content: "y" } }] }), {
          status: 200,
        });
      }),
    );
    await client.chat([{ role: "user", content: "x" }]);
    expect(headers["Authorization"]).toBeUndefined();
  });

  it("raises a clear error on HTTP failure", async () => {
    const client = new LlmClient(
      { baseUrl: "http://x/v1", model: "m" },
      fakeFetch(() => new Response("nope", { status: 500, statusText: "Server Error" })),
    );
    await expect(client.chat([{ role: "user", content: "x" }])).rejects.toThrow(/500/);
  });

  it("lists model ids from /models", async () => {
    const client = new LlmClient(
      { baseUrl: "http://x/v1", model: "m" },
      fakeFetch(() => new Response(JSON.stringify({ data: [{ id: "a" }, { id: "b" }] }), { status: 200 })),
    );
    expect(await client.listModels()).toEqual(["a", "b"]);
  });

  it("testConnection never throws", async () => {
    const client = new LlmClient(
      { baseUrl: "http://x/v1", model: "m" },
      fakeFetch(() => {
        throw new TypeError("connection refused");
      }),
    );
    const res = await client.testConnection();
    expect(res.ok).toBe(false);
    expect(res.error).toBeTruthy();
  });
});
