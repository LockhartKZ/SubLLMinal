# Contributing

Thanks for helping improve SubLLMinal. All changes land through **pull
requests** against `main` — please don't commit directly to `main`.

## Workflow

1. Create a branch off `main`:
   ```bash
   git checkout -b feature/short-description
   ```
2. Make your change. Keep the Rust surface minimal; real logic lives in TypeScript
   under `src/lib` and should be unit-tested.
3. Run the checks locally before pushing:
   ```bash
   npm install
   npm run typecheck   # tsc --noEmit
   npm test            # Vitest unit tests
   ```
4. Push and open a PR. The [CI workflow](.github/workflows/ci.yml) runs typecheck +
   tests on every PR; they must pass before merge.
5. Fill in the PR template, especially the **engine invariants** checklist.

## Ground rules

- **Preserve the engine invariants** that must never break: the parse → serialize
  round-trip of an unchanged file is byte-identical; styling/markup is preserved via
  placeholder masking; batches stay aligned by their line ids; RTL text keeps its
  logical order (never reversed); output is always UTF-8.
- **Never commit secrets.** The LLM API key is kept in memory only and is never
  persisted or committed. `.env*` files are gitignored.
- **Add tests** for any change to parsing, masking, batching, or the alignment engine.
- Match the surrounding code style — vanilla TypeScript, no framework.

## Reporting issues

Open a GitHub issue with the subtitle format (`.srt`/`.ass`), the LLM endpoint/model
you used, and steps to reproduce. A small sample file that triggers the problem helps a lot.

**Found a security issue?** Please don't open a public issue — follow
[SECURITY.md](SECURITY.md) to report it privately.
