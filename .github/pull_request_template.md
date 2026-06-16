## What & why

<!-- Describe the change and the motivation. Link any related issue. -->

## Engine invariants (check the ones this PR touches)

- [ ] Parse → serialize of an **unchanged** file is still byte-identical
- [ ] The LLM still never sees timestamps or container formatting
- [ ] Tag/`⟦n⟧` placeholder masking is preserved (id-tag + token-set validation intact)
- [ ] RTL text remains in logical order (never reversed); output stays UTF-8

## Testing

- [ ] `npm run typecheck` passes
- [ ] `npm test` passes
- [ ] If UI/native behavior changed: verified in `npm run tauri dev` (or noted why not)

## Notes

<!-- Anything reviewers should know: trade-offs, follow-ups, screenshots. -->
