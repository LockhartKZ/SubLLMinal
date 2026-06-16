export type PresetCategory = "local" | "cloud" | "custom";

export interface EndpointPreset {
  id: string;
  label: string;
  baseUrl: string;
  /** Whether this endpoint normally requires an API key. */
  needsKey: boolean;
  /** Which group the endpoint dropdown files this under. */
  category: PresetCategory;
  hint?: string;
}

/**
 * All targets speak the OpenAI-compatible API (`/v1/chat/completions`,
 * `/v1/models`). Local servers ignore the API key; cloud ones require it.
 *
 * `baseUrl` is the prefix the client joins `/chat/completions` and `/models`
 * onto (see `LlmClient.joinUrl`), so it must include any version/path segment
 * the provider puts before `/chat/completions` (e.g. `/v1`, `/api/paas/v4`).
 */
export const ENDPOINT_PRESETS: EndpointPreset[] = [
  // ---- Local ----------------------------------------------------------------
  {
    id: "lmstudio",
    label: "LM Studio",
    baseUrl: "http://localhost:1234/v1",
    needsKey: false,
    category: "local",
    hint: "In LM Studio, load a model and start the server (Developer ▸ Start Server).",
  },
  {
    id: "llamacpp",
    label: "llama.cpp — llama-server",
    baseUrl: "http://localhost:8080/v1",
    needsKey: false,
    category: "local",
    hint: "Run llama-server with your GGUF model; it serves an OpenAI-compatible API.",
  },
  {
    id: "ollama",
    label: "Ollama",
    baseUrl: "http://localhost:11434/v1",
    needsKey: false,
    category: "local",
    hint: "Ollama exposes an OpenAI-compatible API under /v1.",
  },

  // ---- Cloud ----------------------------------------------------------------
  {
    id: "openai",
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    needsKey: true,
    category: "cloud",
    hint: "Requires your own OpenAI API key.",
  },
  {
    id: "anthropic",
    label: "Anthropic (Claude)",
    baseUrl: "https://api.anthropic.com/v1",
    needsKey: true,
    category: "cloud",
    hint: "Uses Anthropic's OpenAI-compatible endpoint. Requires an Anthropic API key.",
  },
  {
    id: "gemini",
    label: "Google Gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    needsKey: true,
    category: "cloud",
    hint: "Gemini's OpenAI-compatible endpoint. Requires a Google AI Studio API key.",
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    baseUrl: "https://api.deepseek.com/v1",
    needsKey: true,
    category: "cloud",
    hint: "Requires a DeepSeek API key.",
  },
  {
    id: "xai",
    label: "xAI (Grok)",
    baseUrl: "https://api.x.ai/v1",
    needsKey: true,
    category: "cloud",
    hint: "Requires an xAI API key.",
  },
  {
    id: "mistral",
    label: "Mistral",
    baseUrl: "https://api.mistral.ai/v1",
    needsKey: true,
    category: "cloud",
    hint: "Requires a Mistral API key.",
  },
  {
    id: "groq",
    label: "Groq",
    baseUrl: "https://api.groq.com/openai/v1",
    needsKey: true,
    category: "cloud",
    hint: "Fast hosted open models. Requires a Groq API key.",
  },
  {
    id: "together",
    label: "Together AI",
    baseUrl: "https://api.together.xyz/v1",
    needsKey: true,
    category: "cloud",
    hint: "Hosted open models. Requires a Together API key.",
  },
  {
    id: "fireworks",
    label: "Fireworks AI",
    baseUrl: "https://api.fireworks.ai/inference/v1",
    needsKey: true,
    category: "cloud",
    hint: "Hosted open models. Requires a Fireworks API key.",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    needsKey: true,
    category: "cloud",
    hint: "Routes to many providers behind one key. Requires an OpenRouter API key.",
  },
  {
    id: "perplexity",
    label: "Perplexity",
    baseUrl: "https://api.perplexity.ai",
    needsKey: true,
    category: "cloud",
    hint: "Requires a Perplexity API key.",
  },
  {
    id: "deepinfra",
    label: "DeepInfra",
    baseUrl: "https://api.deepinfra.com/v1/openai",
    needsKey: true,
    category: "cloud",
    hint: "Hosted open models. Requires a DeepInfra API key.",
  },
  {
    id: "minimax",
    label: "MiniMax",
    baseUrl: "https://api.minimax.io/v1",
    needsKey: true,
    category: "cloud",
    hint: "MiniMax (international). Requires a MiniMax API key — verify the region's base URL.",
  },
  {
    id: "moonshot",
    label: "Moonshot AI (Kimi)",
    baseUrl: "https://api.moonshot.ai/v1",
    needsKey: true,
    category: "cloud",
    hint: "Moonshot/Kimi (international). Requires a Moonshot API key (use .cn for China).",
  },
  {
    id: "zai",
    label: "z.ai (GLM)",
    baseUrl: "https://api.z.ai/api/paas/v4",
    needsKey: true,
    category: "cloud",
    hint: "Zhipu GLM via z.ai. Requires a z.ai API key.",
  },

  // ---- Catch-all ------------------------------------------------------------
  {
    id: "custom",
    label: "Custom endpoint…",
    baseUrl: "",
    needsKey: false,
    category: "custom",
    hint: "Any OpenAI-compatible base URL (e.g. a remote server or a provider not listed).",
  },
];

export const DEFAULT_PRESET_ID = "lmstudio";

export interface PresetGroup {
  /** `<optgroup>` label; empty string means render the presets ungrouped. */
  label: string;
  category: PresetCategory;
  presets: EndpointPreset[];
}

/**
 * Presets bucketed for the endpoint `<select>`, in display order:
 * Local, then Cloud (each under an `<optgroup>`), then the custom catch-all in a
 * trailing unlabelled group. Order within a bucket follows `ENDPOINT_PRESETS`.
 */
export function groupedPresets(): PresetGroup[] {
  const pick = (category: PresetCategory) =>
    ENDPOINT_PRESETS.filter((p) => p.category === category);
  return [
    { label: "Local", category: "local", presets: pick("local") },
    { label: "Cloud", category: "cloud", presets: pick("cloud") },
    { label: "", category: "custom", presets: pick("custom") },
  ];
}
