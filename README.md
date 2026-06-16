# SubLLMinal

[![CI](https://github.com/LockhartKZ/SubLLMinal/actions/workflows/ci.yml/badge.svg)](https://github.com/LockhartKZ/SubLLMinal/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A small Windows desktop app that translates `.srt` and `.ass` subtitle files with an
LLM — **local-first** (LM Studio, llama.cpp, Ollama) with optional cloud endpoints.
It sends the dialogue a few lines at a time with prior lines as context, keeps all
timing and styling intact, and supports right-to-left languages (Arabic, Hebrew, …).

## How it works

- The **app** parses the subtitle file. The model only ever receives the spoken
  text — never timestamps or formatting.
- Styling (ASS `{\i1}` tags, `\N` breaks, `<i>` etc.) is hidden behind placeholders,
  so only the words are translated, then the styling is put back.
- Lines are translated in small batches with an id on each line; the app checks the
  model returned every line with its formatting intact, and automatically retries —
  falling back to one-line-at-a-time — so even small local models finish cleanly.
- Input files in any common encoding work — the app **auto-detects the encoding**
  (UTF-8, UTF-8/UTF-16 with BOM, Windows-1256 Arabic, …) and always writes UTF-8.

## Get the app

Two ways to run it, both produced by `npm run tauri build`:

- **Installer** — `SubLLMinal_<version>_x64-setup.exe` (~3.5 MB). Double-click
  to install; adds a Start-menu shortcut.
- **Portable** — a single `SubLLMinal.exe` (~15 MB) that runs with **no
  installation**: copy it anywhere and double-click. Create it with
  `scripts/make-portable.ps1` after a build (output in `portable/`).

Both only need the Microsoft Edge **WebView2** runtime, which ships with Windows 11 and
recent Windows 10.

## For users

1. **Run a local LLM** (any one of these), or use a cloud endpoint with your own key:
   - **LM Studio** — load a model, then Developer ▸ **Start Server** (`:1234`).
   - **llama.cpp** — run `llama-server` with your GGUF model (`:8080`).
   - **Ollama** — it serves an OpenAI-compatible API at `:11434`.
2. **Open the app**, drag in a `.srt`/`.ass` file (or Browse).
3. Pick the **From** and **To** languages.
4. Open **Model & connection**, choose your endpoint preset, click **Test connection**
   (this also lists the available models), pick a model.
5. Optionally adjust **Translation options** — *Lines per batch* (how many lines go to
   the model at once) and *Context lines* (how many already-translated lines to show it
   for continuity).
6. Optionally fill in **Context / notes for the model** — a short description of the
   movie/show so the model uses the right terminology. e.g. for a chess film: *"keep
   chess terms accurate (grandmaster, gambit) and leave move notation like Nf3, O-O
   unchanged."* This is injected into the prompt for every batch.
7. Click **Translate**, watch the side-by-side preview, then **Save…**.

> A capable, multilingual model gives much better results — especially for Arabic and
> other RTL languages. Bigger/instruction-tuned models follow the formatting rules
> more reliably.

### Handy extras
- **Edit any translation inline** — click a line in the Translation column and type; edits are saved with the file.
- **Retranslate one line** — hover a line and click ↻ to redo just that line.
- **Find & replace** across all translated lines.
- **Recent files** dropdown to reopen quickly.
- **Keyboard shortcuts:** `Ctrl+O` open · `Ctrl+Enter` translate · `Esc` cancel · `Ctrl+S` save.
- **Open folder** after saving reveals the file in Explorer.
- The dot next to **Model & connection** turns green when your endpoint is reachable (auto-checked on launch).
- Input subtitles in any common encoding are auto-detected; output is UTF-8.

## For developers

### Prerequisites
- [Node.js](https://nodejs.org/) 18+
- [Rust](https://www.rust-lang.org/tools/install) (rustup) — to build the native shell
- **MSVC C++ Build Tools** (Windows): the “Desktop development with C++” workload from
  the Visual Studio Build Tools. Rust uses its linker.
- WebView2 runtime — preinstalled on Windows 11.

### Commands
```bash
npm install
npx vitest            # unit tests (parsers, engine, client) — no Rust needed
npm run typecheck     # tsc --noEmit
npm run dev           # frontend only, in a browser (Tauri features inert)
npm run tauri dev     # the real desktop app
npm run tauri build   # installer under src-tauri/target/release/bundle/nsis/
pwsh scripts/make-portable.ps1   # portable single-exe under portable/ (after a build)
npx vite-node scripts/live-translate.ts   # end-to-end check vs a running local LLM
```

### First-time native shell
The `src-tauri/` folder is generated once with `npm run tauri init` (after Rust is
installed), then the HTTP/dialog/store plugins are registered and their permissions
added under `src-tauri/capabilities/`. File read/write is a pair of custom Rust
commands (`read_text_file`/`write_text_file`) rather than the fs plugin, and
`read_text_file` auto-detects the input encoding.

## Project layout
```
src/lib/subtitle/   SRT/ASS parsing + serialization + tag masking
src/lib/llm/        OpenAI-compatible client + endpoint presets
src/lib/translate/  batching/context/alignment engine, prompts, language list
src/lib/io/         native open/save  ·  src/lib/settings.ts  persisted settings
src/main.ts         UI wiring          ·  index.html / src/styles.css  the UI
tests/              Vitest specs + fixtures
```

## Contributing

Changes land via pull requests against `main`. See [CONTRIBUTING.md](CONTRIBUTING.md)
for the workflow and the engine invariants every change must preserve.

## License

[MIT](LICENSE) © LockhartKZ
