# Produces a portable, no-install build: the release app.exe is already
# self-contained (it embeds the web UI and uses the system WebView2 runtime),
# so "portable" just means shipping that single .exe under a friendly name.
# Run AFTER `npm run tauri build`.
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$exe = Join-Path $root "src-tauri\target\release\app.exe"
$dest = Join-Path $root "portable"

if (-not (Test-Path $exe)) {
  throw "Release exe not found at $exe - run 'npm run tauri build' first."
}

New-Item -ItemType Directory -Force -Path $dest | Out-Null
Copy-Item $exe (Join-Path $dest "SubLLMinal.exe") -Force

@"
SubLLMinal - Portable edition
=============================

Just run "SubLLMinal.exe" - no installation needed.

Requirements: the Microsoft Edge WebView2 Runtime, which ships with Windows 11
and recent Windows 10. If the window doesn't open, install the free
"Evergreen WebView2 Runtime" from Microsoft once, then run again.

To translate you also need an LLM endpoint:
  - Local (recommended): LM Studio, llama.cpp (llama-server), or Ollama.
    Start its server, then in the app open "Model & connection", pick the
    matching preset, click "Test connection", and choose a model.
  - Cloud: under "Model & connection" pick a Cloud preset (OpenAI, Anthropic,
    Gemini, DeepSeek, OpenRouter, Groq, ...) - the Base URL fills in
    automatically - then paste your own API key for that provider.

Settings (except the API key) are remembered between runs.
"@ | Out-File -FilePath (Join-Path $dest "README.txt") -Encoding utf8

$size = [math]::Round((Get-Item (Join-Path $dest "SubLLMinal.exe")).Length / 1MB, 2)
Write-Host "Portable build ready in $dest ($size MB)"
