import { getCurrentWebview } from "@tauri-apps/api/webview";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";

import { parseSubtitle, type ParsedSubtitle } from "./lib/subtitle";
import type { Cue } from "./lib/subtitle/types";
import { LlmClient, reasoningEffortFor, type FetchLike, type LlmConfig } from "./lib/llm/client";
import { ENDPOINT_PRESETS, groupedPresets } from "./lib/llm/presets";
import { translateCues } from "./lib/translate/engine";
import { parseGlossary } from "./lib/translate/glossary";
import { TONE_OPTIONS } from "./lib/translate/tone";
import { assessReadability, DEFAULT_LIMITS } from "./lib/subtitle/readability";
import {
  AUTO_DETECT,
  LANGUAGES,
  isRtl,
  languageByCode,
  promptName,
} from "./lib/translate/languages";
import {
  openSubtitle,
  loadPath,
  saveSubtitle,
  defaultOutputName,
  revealInFolder,
  type LoadedFile,
} from "./lib/io/files";
import { loadSettings, saveSettings, type AppSettings } from "./lib/settings";
import {
  filterModels,
  moveHighlight,
  shouldDiscoverModels,
  visibleOptions,
} from "./lib/ui/modelPicker";

// The plugin-http fetch runs in the Rust layer (no CORS); its types are close
// enough to the DOM fetch for our use.
const transport = tauriFetch as unknown as FetchLike;

let settings: AppSettings;
let loaded: LoadedFile | null = null;
let parsed: ParsedSubtitle | null = null;
let abort: AbortController | null = null;
let lastSavedPath: string | null = null;
let translateStart = 0;
/** cue id -> the editable text element inside its translation cell. */
const transCells = new Map<string, HTMLElement>();
/** cue id -> the reading-speed warning badge in its translation cell. */
const transBadges = new Map<string, HTMLElement>();

// ---- tiny DOM helpers -------------------------------------------------------

function el<T extends HTMLElement = HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing element #${id}`);
  return node as T;
}

function btn(id: string): HTMLButtonElement {
  return el<HTMLButtonElement>(id);
}

function option(value: string, label: string): HTMLOptionElement {
  const o = document.createElement("option");
  o.value = value;
  o.textContent = label;
  return o;
}

function msg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function isAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}

let toastTimer: number | undefined;
function toast(text: string, error = false): void {
  const t = el("toast");
  t.textContent = text;
  t.classList.toggle("error", error);
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (t.hidden = true), 4000);
}

function fmtDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

// ---- populate static controls ----------------------------------------------

function fillPresets(): void {
  const sel = el<HTMLSelectElement>("preset");
  for (const group of groupedPresets()) {
    if (!group.label) {
      // unlabelled (custom catch-all): append directly, no <optgroup> header
      for (const p of group.presets) sel.appendChild(option(p.id, p.label));
      continue;
    }
    const og = document.createElement("optgroup");
    og.label = group.label;
    for (const p of group.presets) og.appendChild(option(p.id, p.label));
    sel.appendChild(og);
  }
}

function fillLanguages(): void {
  const src = el<HTMLSelectElement>("sourceLang");
  const tgt = el<HTMLSelectElement>("targetLang");
  src.appendChild(option(AUTO_DETECT.code, AUTO_DETECT.name));
  for (const l of LANGUAGES) {
    const label = `${l.name} — ${l.native}`;
    src.appendChild(option(l.code, label));
    tgt.appendChild(option(l.code, label));
  }
}

function fillTones(): void {
  const sel = el<HTMLSelectElement>("tone");
  for (const t of TONE_OPTIONS) sel.appendChild(option(t.id, t.label));
}

// ---- model combobox ---------------------------------------------------------
// A custom dropdown (input + caret + a menu we render) replaces the native
// <datalist>, so it lists ONLY the models the current endpoint serves — no
// browser autofill "Saved data" from a different server. See lib/ui/modelPicker.

/** Models the current endpoint serves (deduped); the menu is filtered from these. */
let modelOptions: string[] = [];
/** Index of the highlighted row in the open menu, or -1 for none. */
let modelHighlight = -1;
/** True while the user is typing — the menu filters by the field text only then.
 *  When the menu is just opened (focus/caret) it shows every model. */
let modelFiltering = false;

function modelInput(): HTMLInputElement {
  return el<HTMLInputElement>("model");
}
function modelMenuOpen(): boolean {
  return !el("modelMenu").hidden;
}

function fillModels(models: string[]): void {
  modelOptions = filterModels(models, ""); // dedupe, keep order
  const input = modelInput();
  // Auto-pick when the field is empty or holds a model the current endpoint
  // doesn't serve (e.g. a stale id left over from a different server).
  if (modelOptions.length > 0 && !modelOptions.includes(input.value)) {
    input.value = modelOptions[0];
    settings.model = modelOptions[0];
    void saveSettings(settings);
  }
  if (modelMenuOpen()) renderModelMenu();
}

/** Drop the discovered model list — e.g. when switching providers or when a
 *  probe fails, so one endpoint's models never linger under another. */
function clearModels(): void {
  modelOptions = [];
  modelHighlight = -1;
  if (modelMenuOpen()) renderModelMenu();
}

/** Whether the currently-selected endpoint can be auto-probed now (local always;
 *  key-gated cloud only once a key is entered). Explicit buttons bypass this. */
function canDiscoverModels(): boolean {
  const preset = ENDPOINT_PRESETS.find((p) => p.id === el<HTMLSelectElement>("preset").value);
  return shouldDiscoverModels({
    needsKey: preset?.needsKey ?? false,
    apiKey: el<HTMLInputElement>("apiKey").value,
  });
}

/** Auto-probe if allowed; otherwise clear stale models and prompt for a key. */
function discoverModelsIfAllowed(): void {
  if (canDiscoverModels()) {
    void testConnection();
  } else {
    clearModels();
    setConn("unknown", "Enter the API key for this provider, then Test connection.");
  }
}

function renderModelMenu(): void {
  const menu = el<HTMLUListElement>("modelMenu");
  const shown = visibleOptions(modelOptions, modelInput().value, modelFiltering);
  menu.replaceChildren();
  if (shown.length === 0) {
    const li = document.createElement("li");
    li.className = "combo-empty";
    li.textContent = modelOptions.length
      ? "No match"
      : canDiscoverModels()
        ? "No models — run Test connection"
        : "Enter the API key for this provider, then Test connection";
    menu.appendChild(li);
    modelHighlight = -1;
    return;
  }
  if (modelHighlight >= shown.length) modelHighlight = -1;
  shown.forEach((m, i) => {
    const li = document.createElement("li");
    li.className = "combo-option" + (i === modelHighlight ? " active" : "");
    li.textContent = m;
    li.title = m;
    li.setAttribute("role", "option");
    li.setAttribute("aria-selected", i === modelHighlight ? "true" : "false");
    // mousedown (not click) so we beat the input's blur and keep focus.
    li.addEventListener("mousedown", (e) => {
      e.preventDefault();
      selectModel(m);
    });
    if (i === modelHighlight) queueMicrotask(() => li.scrollIntoView({ block: "nearest" }));
    menu.appendChild(li);
  });
}

function openModelMenu(): void {
  el("modelMenu").hidden = false;
  el("modelCombo").classList.add("open");
  modelInput().setAttribute("aria-expanded", "true");
  renderModelMenu();
}

function closeModelMenu(): void {
  el("modelMenu").hidden = true;
  el("modelCombo").classList.remove("open");
  modelInput().setAttribute("aria-expanded", "false");
  modelHighlight = -1;
  modelFiltering = false; // next open shows the full list again
}

function selectModel(model: string): void {
  modelInput().value = model;
  closeModelMenu();
  persist(); // reads #model into settings.model and saves
}

function setupModelDropdown(): void {
  const input = modelInput();

  input.addEventListener("focus", () => {
    modelFiltering = false; // a fresh open always shows the full list
    openModelMenu();
  });
  input.addEventListener("input", () => {
    modelHighlight = -1;
    modelFiltering = true; // typing narrows the list; opening doesn't
    modelMenuOpen() ? renderModelMenu() : openModelMenu();
  });
  input.addEventListener("keydown", (e) => {
    const shown = visibleOptions(modelOptions, input.value, modelFiltering);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!modelMenuOpen()) openModelMenu();
      modelHighlight = moveHighlight(shown.length, modelHighlight, e.key === "ArrowDown" ? 1 : -1);
      renderModelMenu();
    } else if (e.key === "Enter" && modelMenuOpen() && modelHighlight >= 0) {
      e.preventDefault();
      selectModel(shown[modelHighlight]);
    } else if (e.key === "Escape" && modelMenuOpen()) {
      e.preventDefault();
      e.stopPropagation(); // don't let the global Esc abort a running translation
      closeModelMenu();
    }
  });

  el("modelToggle").addEventListener("mousedown", (e) => {
    e.preventDefault(); // keep input focus
    if (modelMenuOpen()) closeModelMenu();
    else {
      modelFiltering = false; // caret shows the full list
      input.focus();
      openModelMenu();
    }
  });

  // Click anywhere outside the combobox closes the menu.
  document.addEventListener("mousedown", (e) => {
    if (!el("modelCombo").contains(e.target as Node)) closeModelMenu();
  });
}

// ---- settings <-> form ------------------------------------------------------

function applySettings(s: AppSettings): void {
  el<HTMLSelectElement>("preset").value = s.presetId;
  el<HTMLInputElement>("baseUrl").value = s.baseUrl;
  el<HTMLInputElement>("model").value = s.model;
  el<HTMLInputElement>("apiKey").value = s.apiKey;
  el<HTMLSelectElement>("sourceLang").value = s.sourceLang;
  el<HTMLSelectElement>("targetLang").value = s.targetLang;
  el<HTMLInputElement>("batchSize").value = String(s.batchSize);
  el<HTMLInputElement>("contextLines").value = String(s.contextLines);
  el<HTMLInputElement>("temperature").value = String(s.temperature);
  el<HTMLTextAreaElement>("contextNote").value = s.contextNote;
  el<HTMLTextAreaElement>("glossary").value = s.glossary;
  el<HTMLSelectElement>("tone").value = s.tone;
  el<HTMLInputElement>("refine").checked = s.refine;
  el<HTMLInputElement>("reasoning").checked = s.reasoning;
  const preset = ENDPOINT_PRESETS.find((p) => p.id === s.presetId);
  el("presetHint").textContent = preset?.hint ?? "";
}

/** Read the form fields (everything except programmatic state like recentFiles). */
function gatherSettings(): Omit<AppSettings, "recentFiles"> {
  const int = (id: string, def: number) => {
    const n = parseInt(el<HTMLInputElement>(id).value, 10);
    return Number.isFinite(n) ? n : def;
  };
  return {
    presetId: el<HTMLSelectElement>("preset").value,
    baseUrl: el<HTMLInputElement>("baseUrl").value.trim(),
    model: el<HTMLInputElement>("model").value.trim(),
    apiKey: el<HTMLInputElement>("apiKey").value,
    sourceLang: el<HTMLSelectElement>("sourceLang").value,
    targetLang: el<HTMLSelectElement>("targetLang").value,
    batchSize: int("batchSize", 10),
    contextLines: int("contextLines", 6),
    temperature: parseFloat(el<HTMLInputElement>("temperature").value) || 0,
    contextNote: el<HTMLTextAreaElement>("contextNote").value,
    glossary: el<HTMLTextAreaElement>("glossary").value,
    tone: el<HTMLSelectElement>("tone").value,
    refine: el<HTMLInputElement>("refine").checked,
    reasoning: el<HTMLInputElement>("reasoning").checked,
  };
}

function persist(): void {
  settings = { ...settings, ...gatherSettings() };
  void saveSettings(settings);
}

function currentConfig(): LlmConfig {
  return {
    baseUrl: settings.baseUrl,
    model: settings.model,
    apiKey: settings.apiKey.trim() || undefined,
    temperature: settings.temperature,
    // Always explicit: "medium" when the toggle is on, "none" when off (so we
    // actively disable thinking instead of leaving it to the model's default).
    reasoningEffort: reasoningEffortFor(settings.reasoning),
  };
}

// ---- recent files -----------------------------------------------------------

function addRecent(path: string): void {
  settings.recentFiles = [path, ...settings.recentFiles.filter((p) => p !== path)].slice(0, 8);
  void saveSettings(settings);
  renderRecent();
}

function renderRecent(): void {
  const sel = el<HTMLSelectElement>("recentFiles");
  sel.innerHTML = "";
  if (settings.recentFiles.length === 0) {
    sel.hidden = true;
    return;
  }
  sel.appendChild(option("", "Recent files…"));
  for (const p of settings.recentFiles) {
    const o = option(p, p.split(/[\\/]/).pop() ?? p);
    o.title = p;
    sel.appendChild(o);
  }
  sel.value = "";
  sel.hidden = false;
}

async function openRecent(): Promise<void> {
  const sel = el<HTMLSelectElement>("recentFiles");
  const path = sel.value;
  sel.value = "";
  if (!path) return;
  try {
    const file = await loadPath(path);
    if (file) handleLoaded(file);
    else toast("Could not open (unsupported or missing file).", true);
  } catch (err) {
    toast(`Open failed: ${msg(err)}`, true);
  }
}

// ---- file handling & preview ------------------------------------------------

function handleLoaded(file: LoadedFile): void {
  loaded = file;
  parsed = parseSubtitle(file.content, file.format);
  el("fileInfo").textContent =
    `${file.name} — ${parsed.cues.length} line(s) · ${file.format.toUpperCase()}`;
  renderPreview(parsed);
  btn("translateBtn").disabled = parsed.cues.length === 0;
  btn("saveBtn").disabled = true;
  btn("openFolderBtn").disabled = true;
  el("findReplace").hidden = parsed.cues.length === 0;
  lastSavedPath = null;
  addRecent(file.path);
}

function markEdited(): void {
  if (parsed) btn("saveBtn").disabled = false;
}

function renderPreview(p: ParsedSubtitle): void {
  const body = el("previewBody");
  body.innerHTML = "";
  transCells.clear();
  transBadges.clear();
  const rtl = isRtl(settings.targetLang);
  const frag = document.createDocumentFragment();
  for (const cue of p.cues) {
    const row = document.createElement("div");
    row.className = "prow";

    const orig = document.createElement("div");
    orig.className = "cell orig";
    orig.textContent = cue.text; // source, captured before translation mutates it

    const trans = document.createElement("div");
    trans.className = "cell trans";
    const txt = document.createElement("div");
    txt.className = "txt";
    txt.contentEditable = "true";
    txt.dir = rtl ? "rtl" : "ltr";
    txt.addEventListener("blur", () => {
      const edited = txt.innerText.replace(/\n+$/, "");
      if (edited !== cue.text) {
        cue.text = edited;
        markEdited();
      }
      updateBadge(cue); // edit may have changed reading speed / length
    });
    const retrans = document.createElement("button");
    retrans.className = "retrans";
    retrans.type = "button";
    retrans.textContent = "↻";
    retrans.title = "Retranslate this line";
    retrans.addEventListener("click", () => void retranslateOne(cue, txt, retrans));

    const badge = document.createElement("span");
    badge.className = "cps-badge";
    badge.hidden = true;

    trans.append(txt, retrans, badge);
    row.append(orig, trans);
    frag.append(row);
    transCells.set(cue.id, txt);
    transBadges.set(cue.id, badge);
  }
  body.append(frag);
}

/**
 * Show/refresh the reading-speed warning badge for one cue. Advisory only —
 * never blocks Save. Measures the current (translated/edited) `cue.text`; an
 * empty cell or a comfortable line shows nothing.
 */
function updateBadge(cue: Cue): void {
  const badge = transBadges.get(cue.id);
  if (!badge) return;
  const r = assessReadability(cue);
  if (r.ok) {
    badge.hidden = true;
    badge.textContent = "";
    badge.title = "";
    return;
  }
  const labels: string[] = [];
  const tips: string[] = [];
  if (r.tooFast && r.cps !== undefined) {
    labels.push(`${Math.round(r.cps)} cps`);
    tips.push(`Reading speed ${r.cps.toFixed(1)} cps exceeds the ${DEFAULT_LIMITS.maxCps} cps guideline — too fast to read comfortably. Shorten the line or it needs more screen time.`);
  }
  if (r.lineTooLong) {
    labels.push(`${r.longestLine} ch`);
    tips.push(`Longest line is ${r.longestLine} characters (max ${DEFAULT_LIMITS.maxLineLength}).`);
  }
  if (r.tooManyLines) {
    labels.push(`${r.lineCount} lines`);
    tips.push(`${r.lineCount} lines (max ${DEFAULT_LIMITS.maxLines}).`);
  }
  badge.textContent = `⚠ ${labels.join(" · ")}`;
  badge.title = tips.join("\n");
  badge.hidden = false;
}

function applyDir(): void {
  const rtl = isRtl(settings.targetLang);
  for (const txt of transCells.values()) txt.dir = rtl ? "rtl" : "ltr";
}

function refreshTranslationCells(): void {
  if (!parsed) return;
  for (const cue of parsed.cues) {
    const cell = transCells.get(cue.id);
    if (cell && cell !== document.activeElement && cell.textContent !== cue.text) {
      cell.textContent = cue.text;
    }
    updateBadge(cue);
  }
}

// ---- actions ----------------------------------------------------------------

function setBusy(busy: boolean): void {
  btn("translateBtn").disabled = busy || !parsed;
  btn("cancelBtn").disabled = !busy;
  btn("browseBtn").disabled = busy;
  btn("replaceAllBtn").disabled = busy;
  if (busy) el("progressWrap").hidden = false;
  const body = el("previewBody");
  body.querySelectorAll<HTMLButtonElement>(".retrans").forEach((b) => (b.disabled = busy));
  body.querySelectorAll<HTMLElement>(".txt").forEach((t) => (t.contentEditable = busy ? "false" : "true"));
}

async function browse(): Promise<void> {
  try {
    const file = await openSubtitle();
    if (file) handleLoaded(file);
    else toast("No subtitle selected.");
  } catch (err) {
    toast(`Open failed: ${msg(err)}`, true);
  }
}

function setConn(state: "unknown" | "ok" | "fail", text: string): void {
  const dot = el("connDot");
  dot.classList.remove("ok", "fail");
  if (state !== "unknown") dot.classList.add(state);
  dot.title = text;
  el("connStatus").textContent = text;
}

async function testConnection(): Promise<void> {
  persist();
  setConn("unknown", "Testing…");
  try {
    const res = await new LlmClient(currentConfig(), transport).testConnection();
    if (res.ok) {
      setConn("ok", `Connected — ${res.models?.length ?? 0} model(s)`);
      fillModels(res.models ?? []);
    } else {
      setConn("fail", `Not connected: ${res.error}`);
      clearModels(); // never keep a previous endpoint's models on a failed probe
    }
  } catch (err) {
    setConn("fail", `Not connected: ${msg(err)}`);
    clearModels();
  }
}

async function refreshModels(): Promise<void> {
  persist();
  try {
    fillModels(await new LlmClient(currentConfig(), transport).listModels());
  } catch (err) {
    toast(`Could not list models: ${msg(err)}`, true);
  }
}

async function translate(): Promise<void> {
  if (!parsed) return;
  persist();
  if (!settings.baseUrl) return toast("Set a base URL in Model & connection.", true);
  if (!settings.model) {
    // Many local servers (e.g. llama.cpp) load a single model — auto-pick it.
    try {
      const models = await new LlmClient(currentConfig(), transport).listModels();
      if (models.length) {
        settings.model = models[0];
        el<HTMLInputElement>("model").value = models[0];
        void saveSettings(settings);
      }
    } catch {
      /* fall through to the message below */
    }
  }
  if (!settings.model) {
    return toast("No model — start your local server, then click Test connection.", true);
  }

  setBusy(true);
  abort = new AbortController();
  translateStart = Date.now();
  try {
    await translateCues({
      cues: parsed.cues,
      backend: new LlmClient(currentConfig(), transport),
      sourceName: promptName(settings.sourceLang),
      targetName: promptName(settings.targetLang),
      batchSize: settings.batchSize,
      contextLines: settings.contextLines,
      contextNote: settings.contextNote,
      glossary: parseGlossary(settings.glossary),
      tone: settings.tone,
      refine: settings.refine,
      rtl: isRtl(settings.targetLang),
      maxRetries: 2,
      signal: abort.signal,
      onProgress: updateProgress,
    });
    refreshTranslationCells();
    toast(`Done — ${parsed.cues.length} line(s) translated.`);
    btn("saveBtn").disabled = false;
  } catch (err) {
    refreshTranslationCells();
    if (isAbort(err)) toast("Cancelled — partial result kept. You can still Save.");
    else toast(`Error: ${msg(err)}`, true);
    btn("saveBtn").disabled = false;
  } finally {
    setBusy(false);
    abort = null;
  }
}

/** Re-run translation for a single cue (used by the per-row ↻ button). */
async function retranslateOne(cue: Cue, txtEl: HTMLElement, button: HTMLButtonElement): Promise<void> {
  persist();
  if (!settings.baseUrl || !settings.model) {
    return toast("Set the model in Model & connection first.", true);
  }
  button.disabled = true;
  const before = cue.text;
  try {
    await translateCues({
      cues: [cue],
      backend: new LlmClient(currentConfig(), transport),
      sourceName: promptName(settings.sourceLang),
      targetName: promptName(settings.targetLang),
      batchSize: 1,
      contextLines: 0,
      contextNote: settings.contextNote,
      glossary: parseGlossary(settings.glossary),
      tone: settings.tone,
      rtl: isRtl(settings.targetLang),
      maxRetries: 2,
    });
    txtEl.textContent = cue.text;
    updateBadge(cue);
    if (cue.text !== before) markEdited();
  } catch (err) {
    toast(`Retranslate failed: ${msg(err)}`, true);
  } finally {
    button.disabled = false;
  }
}

function updateProgress(done: number, total: number): void {
  const pct = total ? Math.round((done / total) * 100) : 0;
  el("progressBar").style.width = `${pct}%`;
  const elapsed = (Date.now() - translateStart) / 1000;
  let extra = "";
  if (done > 0 && elapsed > 0.5) {
    const rate = done / elapsed;
    if (rate > 0) extra = ` · ${rate.toFixed(1)} lines/s · ~${fmtDuration((total - done) / rate)} left`;
  }
  el("progressText").textContent = `${done} / ${total} (${pct}%)${extra}`;
  refreshTranslationCells();
}

function replaceAll(): void {
  if (!parsed) return;
  const find = el<HTMLInputElement>("findInput").value;
  if (!find) return toast("Enter text to find.", true);
  const repl = el<HTMLInputElement>("replaceInput").value;
  let count = 0;
  for (const cue of parsed.cues) {
    if (!cue.text.includes(find)) continue;
    count += cue.text.split(find).length - 1;
    cue.text = cue.text.split(find).join(repl);
  }
  refreshTranslationCells();
  if (count > 0) {
    markEdited();
    toast(`Replaced ${count} occurrence(s).`);
  } else {
    toast("No matches.");
  }
}

async function saveFile(): Promise<void> {
  if (!parsed || !loaded) return;
  try {
    const name = defaultOutputName(loaded.name, settings.targetLang, parsed.format);
    const path = await saveSubtitle(name, parsed.serialize(), parsed.format);
    if (path) {
      lastSavedPath = path;
      btn("openFolderBtn").disabled = false;
      toast(`Saved: ${path}`);
    }
  } catch (err) {
    toast(`Save failed: ${msg(err)}`, true);
  }
}

function onPresetChange(): void {
  const preset = ENDPOINT_PRESETS.find((p) => p.id === el<HTMLSelectElement>("preset").value);
  if (preset) {
    if (preset.baseUrl) el<HTMLInputElement>("baseUrl").value = preset.baseUrl;
    el("presetHint").textContent = preset.hint ?? "";
    el<HTMLInputElement>("model").value = ""; // drop any model from the previous endpoint
  }
  clearModels(); // never carry one provider's models into the next
  persist();
  discoverModelsIfAllowed(); // probe now if local/keyed; else wait for the key
}

// ---- wiring -----------------------------------------------------------------

async function setupDragAndDrop(): Promise<void> {
  const dz = el("dropzone");
  try {
    await getCurrentWebview().onDragDropEvent(async (event) => {
      const p = event.payload;
      if (p.type === "drop") {
        dz.classList.remove("hover");
        const path = p.paths[0];
        if (!path) return;
        const file = await loadPath(path);
        if (file) handleLoaded(file);
        else toast("Unsupported file — use .srt or .ass.", true);
      } else if (p.type === "over" || p.type === "enter") {
        dz.classList.add("hover");
      } else {
        dz.classList.remove("hover");
      }
    });
  } catch {
    // Not running inside Tauri (e.g. plain `vite`): drag-and-drop unavailable.
  }
}

function setupShortcuts(): void {
  document.addEventListener("keydown", (e) => {
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && e.key.toLowerCase() === "o") {
      e.preventDefault();
      void browse();
    } else if (ctrl && e.key.toLowerCase() === "s") {
      e.preventDefault();
      if (!btn("saveBtn").disabled) void saveFile();
    } else if (ctrl && e.key === "Enter") {
      e.preventDefault();
      if (!btn("translateBtn").disabled) void translate();
    } else if (e.key === "Escape") {
      if (!btn("cancelBtn").disabled) abort?.abort();
    }
  });
}

function wireEvents(): void {
  btn("browseBtn").addEventListener("click", () => void browse());
  btn("translateBtn").addEventListener("click", () => void translate());
  btn("cancelBtn").addEventListener("click", () => abort?.abort());
  btn("saveBtn").addEventListener("click", () => void saveFile());
  btn("openFolderBtn").addEventListener("click", () => {
    if (lastSavedPath) void revealInFolder(lastSavedPath).catch((e) => toast(`Could not open: ${msg(e)}`, true));
  });
  btn("testBtn").addEventListener("click", () => void testConnection());
  btn("refreshModels").addEventListener("click", () => void refreshModels());
  btn("replaceAllBtn").addEventListener("click", replaceAll);
  el("recentFiles").addEventListener("change", () => void openRecent());
  el("preset").addEventListener("change", onPresetChange);
  el("targetLang").addEventListener("change", () => {
    persist();
    applyDir();
  });
  el("baseUrl").addEventListener("change", () => {
    persist();
    clearModels();
    discoverModelsIfAllowed(); // different server -> re-discover (if allowed)
  });
  el("apiKey").addEventListener("change", () => {
    persist();
    // A key just appeared/changed -> probe the key-gated endpoint now.
    if (canDiscoverModels()) void testConnection();
  });
  for (const id of ["sourceLang", "model", "batchSize", "contextLines", "temperature", "contextNote", "glossary", "tone", "refine", "reasoning"]) {
    el(id).addEventListener("change", persist);
  }
  setupModelDropdown();
  setupShortcuts();
}

async function init(): Promise<void> {
  fillPresets();
  fillLanguages();
  fillTones();
  settings = await loadSettings();
  applySettings(settings);
  renderRecent();
  wireEvents();
  await setupDragAndDrop();
  document.documentElement.lang = languageByCode(settings.targetLang)?.code ?? "en";
  // Auto-probe the configured endpoint so the status dot + model list are ready.
  // The API key is never persisted, so a saved cloud provider starts keyless —
  // don't fire a doomed 401; wait for the key (or an explicit Test connection).
  discoverModelsIfAllowed();
}

void init();
