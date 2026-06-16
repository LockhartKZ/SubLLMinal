import { load, type Store } from "@tauri-apps/plugin-store";
import { DEFAULT_PRESET_ID } from "./llm/presets";

export interface AppSettings {
  presetId: string;
  baseUrl: string;
  model: string;
  apiKey: string;
  sourceLang: string;
  targetLang: string;
  batchSize: number;
  contextLines: number;
  temperature: number;
  /** Free-text notes about the material (genre, terminology, names) for the model. */
  contextNote: string;
  /** Free-text glossary: `source = target` term mappings, one per line. */
  glossary: string;
  /** Tone/formality id from `tone.ts` (e.g. "default", "formal", "informal"). */
  tone: string;
  /** Run a second review/improve pass after translating (≈doubles model calls). */
  refine: boolean;
  /** Ask the model to reason/think before answering (sends reasoning_effort=medium). */
  reasoning: boolean;
  /** Most-recently-opened file paths, newest first. */
  recentFiles: string[];
}

export const DEFAULT_SETTINGS: AppSettings = {
  presetId: DEFAULT_PRESET_ID,
  baseUrl: "http://localhost:1234/v1",
  model: "",
  apiKey: "",
  sourceLang: "auto",
  targetLang: "ar",
  batchSize: 10,
  contextLines: 6,
  temperature: 0.2,
  contextNote: "",
  glossary: "",
  tone: "default",
  refine: false,
  reasoning: false,
  recentFiles: [],
};

const STORE_FILE = "settings.json";
const KEY = "app";

let storePromise: Promise<Store> | null = null;
function getStore(): Promise<Store> {
  if (!storePromise) storePromise = load(STORE_FILE, { defaults: {}, autoSave: false });
  return storePromise;
}

export async function loadSettings(): Promise<AppSettings> {
  try {
    const store = await getStore();
    const saved = await store.get<Partial<AppSettings>>(KEY);
    return { ...DEFAULT_SETTINGS, ...(saved ?? {}) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  try {
    const store = await getStore();
    // Persist everything except the API key, which we keep only in memory/session.
    const { apiKey: _apiKey, ...safe } = settings;
    await store.set(KEY, safe);
    await store.save();
  } catch {
    // Settings persistence is best-effort; ignore storage failures.
  }
}
