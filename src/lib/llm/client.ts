/**
 * Minimal OpenAI-compatible chat client.
 *
 * The same shape works for LM Studio, llama.cpp's llama-server, Ollama, and
 * cloud OpenAI — the only differences are the base URL and whether an API key
 * is sent. `fetchFn` is injectable so the engine is testable under Node and so
 * the Tauri app can pass `@tauri-apps/plugin-http`'s fetch (which runs in the
 * Rust layer and is therefore free of browser CORS limits).
 */

export type FetchLike = typeof fetch;

/**
 * The `reasoning_effort` to send for the on/off toggle. When ON we ask for
 * `"medium"` effort; when OFF we send an explicit `"none"` so reasoning is
 * actively disabled — rather than omitting the field and letting a model that
 * thinks by default (e.g. Qwen3) keep reasoning.
 */
export function reasoningEffortFor(enabled: boolean): "medium" | "none" {
  return enabled ? "medium" : "none";
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LlmConfig {
  /** e.g. "http://localhost:1234/v1" (trailing slash optional). */
  baseUrl: string;
  model: string;
  /** Optional — omit/blank for local servers. */
  apiKey?: string;
  temperature?: number;
  maxTokens?: number;
  /**
   * OpenAI-compatible reasoning/thinking effort (`"low" | "medium" | "high"`).
   * Sent as `reasoning_effort` only when set; omit it to leave the model's
   * default behaviour untouched. Servers that don't reason ignore the field.
   */
  reasoningEffort?: string;
  /** Per-request timeout. Default 120s. */
  timeoutMs?: number;
}

/** The surface the translation engine depends on (easy to mock in tests). */
export interface ChatBackend {
  chat(messages: ChatMessage[], signal?: AbortSignal): Promise<string>;
}

export class LlmError extends Error {
  constructor(
    message: string,
    readonly kind: "network" | "timeout" | "aborted" | "http" | "bad_response",
    readonly status?: number,
  ) {
    super(message);
    this.name = "LlmError";
  }
}

function joinUrl(baseUrl: string, path: string): string {
  return baseUrl.replace(/\/+$/, "") + path;
}

function combineSignals(timeoutMs: number, external?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  if (!external) return timeout;
  return AbortSignal.any([timeout, external]);
}

export class LlmClient implements ChatBackend {
  constructor(
    private readonly cfg: LlmConfig,
    private readonly fetchFn: FetchLike = fetch,
  ) {}

  private headers(): Record<string, string> {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (this.cfg.apiKey) h["Authorization"] = `Bearer ${this.cfg.apiKey}`;
    return h;
  }

  async chat(messages: ChatMessage[], signal?: AbortSignal): Promise<string> {
    const body = JSON.stringify({
      model: this.cfg.model,
      messages,
      temperature: this.cfg.temperature ?? 0.2,
      stream: false,
      ...(this.cfg.maxTokens ? { max_tokens: this.cfg.maxTokens } : {}),
      ...(this.cfg.reasoningEffort ? { reasoning_effort: this.cfg.reasoningEffort } : {}),
    });

    let res: Response;
    try {
      res = await this.fetchFn(joinUrl(this.cfg.baseUrl, "/chat/completions"), {
        method: "POST",
        headers: this.headers(),
        body,
        signal: combineSignals(this.cfg.timeoutMs ?? 120_000, signal),
      });
    } catch (err) {
      throw toLlmError(err, signal);
    }

    if (!res.ok) {
      const detail = await safeText(res);
      throw new LlmError(
        `Server returned ${res.status} ${res.statusText}${detail ? `: ${detail}` : ""}`,
        "http",
        res.status,
      );
    }

    let data: any;
    try {
      data = await res.json();
    } catch {
      throw new LlmError("Response was not valid JSON", "bad_response", res.status);
    }
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      throw new LlmError("Response had no message content", "bad_response", res.status);
    }
    return content;
  }

  /** List model ids exposed by the endpoint (`GET /models`). */
  async listModels(signal?: AbortSignal): Promise<string[]> {
    let res: Response;
    try {
      res = await this.fetchFn(joinUrl(this.cfg.baseUrl, "/models"), {
        method: "GET",
        headers: this.headers(),
        signal: combineSignals(this.cfg.timeoutMs ?? 30_000, signal),
      });
    } catch (err) {
      throw toLlmError(err, signal);
    }
    if (!res.ok) {
      throw new LlmError(`Server returned ${res.status} ${res.statusText}`, "http", res.status);
    }
    const data: any = await res.json().catch(() => null);
    const list: any[] = data?.data ?? [];
    return list.map((m) => m?.id).filter((id): id is string => typeof id === "string");
  }

  /** Probe the endpoint; never throws. */
  async testConnection(): Promise<{ ok: boolean; models?: string[]; error?: string }> {
    try {
      const models = await this.listModels();
      return { ok: true, models };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}

function toLlmError(err: unknown, external?: AbortSignal): LlmError {
  if (err instanceof DOMException && err.name === "AbortError") {
    return external?.aborted
      ? new LlmError("Request cancelled", "aborted")
      : new LlmError("Request timed out", "timeout");
  }
  if (err instanceof DOMException && err.name === "TimeoutError") {
    return new LlmError("Request timed out", "timeout");
  }
  return new LlmError(
    `Could not reach the LLM server (${err instanceof Error ? err.message : String(err)})`,
    "network",
  );
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 300);
  } catch {
    return "";
  }
}
