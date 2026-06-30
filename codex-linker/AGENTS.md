# Project Agent Instructions

## codex-linker

CLI for creating linked Codex homes for multiple ChatGPT OAuth accounts while
keeping each profile's auth state separate.

## Commands

- `bun run build` - compile TypeScript to `dist/`
- `bun run typecheck` - type-check without emitting
- `bun test` - run Node tests through `tsx`
- `codex-linker doctor <profile>` - validate a linked account home after build

## File and directory rules

- Source files live in `src/`; use lower camel-case TypeScript filenames that
  match the exported responsibility, e.g. `linker.ts` or `paths.ts`.
- Tests live in `tests/`; name test files `*.test.ts`.
- Compiled output lives in `dist/` and must not be committed.
- Do not add generated account homes, local Codex state, OAuth files, or logs
  to the repo. Use local account/config directories or `/tmp` for local runs.
- Profile names used in examples should stay shell-safe lowercase tokens such
  as `subs2` or `subs3`.

## Security

- Never copy, symlink, print, or modify OAuth auth files except through
  explicit user-driven Codex login flows.
- Shared links should come from the primary Codex home and must keep secondary
  homes isolated by `CODEX_HOME`.
