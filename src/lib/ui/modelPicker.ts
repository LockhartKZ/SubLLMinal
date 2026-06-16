/**
 * Pure logic for the custom model combobox.
 *
 * The model field used to be a native `<input list>` + `<datalist>`. That had
 * two problems: the browser only suggested options matching the typed text (so
 * a multi-model endpoint looked single-model), and it merged the browser's own
 * autofill history ("Saved data" — e.g. a model id left over from a different
 * server). We now render the dropdown ourselves, so it shows ONLY the models
 * the current endpoint serves, styled to match the app. These helpers decide
 * what the menu lists and which row is highlighted; `main.ts` owns the DOM.
 */

/**
 * The models to show for a given query: a case-insensitive substring match,
 * de-duplicated, original order preserved. A blank query lists everything.
 */
export function filterModels(models: string[], query: string): string[] {
  const seen = new Set<string>();
  const unique = models.filter((m) => (seen.has(m) ? false : (seen.add(m), true)));
  const q = query.trim().toLowerCase();
  if (q === "") return unique;
  return unique.filter((m) => m.toLowerCase().includes(q));
}

/**
 * What the open menu should list. When the user is *typing* (`filtering`), match
 * the field text; otherwise (the menu was just opened by focus/caret) show every
 * model — so a field pre-filled with one model's id doesn't hide the others.
 */
export function visibleOptions(models: string[], query: string, filtering: boolean): string[] {
  return filterModels(models, filtering ? query : "");
}

/**
 * Whether to auto-probe the endpoint's model list right now (on provider
 * select, base-URL change, or launch). No-key endpoints (local servers, custom)
 * are always probed; key-gated cloud endpoints only once the user has supplied a
 * key. Probing too early would 401 on every provider switch and — the bug this
 * guards — leave the *previous* provider's models showing. Explicit actions
 * (Test connection / Refresh models buttons) bypass this and always try.
 */
export function shouldDiscoverModels(opts: { needsKey: boolean; apiKey: string }): boolean {
  return !opts.needsKey || opts.apiKey.trim() !== "";
}

/**
 * Next highlighted index after an arrow key. `delta` is +1 (down) or -1 (up).
 * Wraps at both ends; an empty menu has no highlight (-1). A starting index of
 * -1 (nothing highlighted) moves to the first row on the way down / last on up.
 */
export function moveHighlight(count: number, current: number, delta: number): number {
  if (count <= 0) return -1;
  const base = current < 0 ? (delta > 0 ? -1 : 0) : current;
  return (base + delta + count) % count;
}
