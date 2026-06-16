import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Locks in the production hardening of the Tauri shell.
 *
 * The webview can invoke our custom Rust commands `read_text_file` /
 * `write_text_file` (arbitrary file read/write, NOT ACL-gated) and has a broad
 * outbound http scope. With the Content-Security-Policy disabled, any future
 * HTML-injection bug (e.g. rendering subtitle text as markup) would escalate to
 * full host compromise. These assertions keep the shipped CSP restrictive.
 *
 * NOTE: this guards the config value only. The CSP must still be verified live
 * (`npm run tauri dev` + a production build) before a release.
 */
const conf = JSON.parse(
  readFileSync(new URL("../src-tauri/tauri.conf.json", import.meta.url), "utf8"),
);

/** Split a CSP string into `directive -> [sources]`. */
function directives(csp: string): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const part of csp.split(";")) {
    const [name, ...values] = part.trim().split(/\s+/);
    if (name) map.set(name, values);
  }
  return map;
}

describe("tauri production CSP", () => {
  const csp: unknown = conf?.app?.security?.csp;

  it("is set (not null)", () => {
    expect(typeof csp).toBe("string");
    expect((csp as string).length).toBeGreaterThan(0);
  });

  it("defaults to 'self' and forbids eval", () => {
    const d = directives(csp as string);
    expect(d.get("default-src")).toContain("'self'");
    expect(csp as string).not.toContain("'unsafe-eval'");
  });

  it("does not allow inline or remote scripts", () => {
    const d = directives(csp as string);
    // No explicit script-src means it inherits from default-src.
    const scriptSrc = d.get("script-src") ?? d.get("default-src") ?? [];
    expect(scriptSrc).toContain("'self'");
    expect(scriptSrc).not.toContain("'unsafe-inline'");
    expect(scriptSrc.some((s) => s.startsWith("http"))).toBe(false);
  });
});

/**
 * Least-privilege CI: the GitHub Actions `GITHUB_TOKEN` should be read-only.
 * Without an explicit `permissions` block the token inherits the repo default
 * (often read/write), so a compromised build dependency could push to the repo
 * or tamper with releases. We pin it to `contents: read`. (Coarse text checks —
 * the workflow file is small and stable.)
 */
const ciYml = readFileSync(
  new URL("../.github/workflows/ci.yml", import.meta.url),
  "utf8",
);

describe("CI token permissions", () => {
  it("declares an explicit permissions block", () => {
    expect(ciYml).toMatch(/^permissions:/m);
  });

  it("grants only read access, never blanket write", () => {
    expect(ciYml).toMatch(/contents:\s*read/);
    expect(ciYml).not.toMatch(/permissions:\s*write-all/);
    expect(ciYml).not.toMatch(/:\s*write\b/);
  });
});
