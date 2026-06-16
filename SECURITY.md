# Security Policy

## Reporting a vulnerability

Please report security issues **privately** — do not open a public issue for them.

Use GitHub's **"Report a vulnerability"** button under this repository's **Security**
tab (Security Advisories → Report a vulnerability). That opens a private channel with
the maintainers. We aim to acknowledge a report within a few days.

When reporting, please include:

- what the issue is and the impact you think it has,
- steps (or a small sample subtitle file) to reproduce,
- the app version and OS, and the LLM endpoint/model if relevant.

## Scope and threat model

This is a local-first Windows desktop app (Tauri). A few things are intentional and
**not** vulnerabilities on their own:

- **The app sends dialogue text to the LLM endpoint you configure.** That endpoint —
  local or cloud — is trusted by you. Choose endpoints you trust; an API key is sent
  only as a `Bearer` header to the base URL you set.
- **The app reads and writes the subtitle files you pick** via native open/save
  dialogs. It does not open files on its own.
- **The API key is kept in memory only.** It is never written to disk or committed;
  all other settings persist via the Tauri store.

Things we *do* care about, for example: a crafted subtitle file causing code
execution or escaping the file you opened; a way to exfiltrate files or the API key
to somewhere other than your configured endpoint; or a Content-Security-Policy /
capability bypass in the Tauri shell.

## Supported versions

This is a young project; security fixes land on `main` and ship in the next build.
There is no long-term support branch yet.
