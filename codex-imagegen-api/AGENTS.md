# Project Agent Instructions

## imagegen-api

Fast image generation via Codex's private ChatGPT-authenticated backend, with
a headless `codex exec` fallback. See `docs/CORE.md` for the full provider
comparison and decision.

## Commands

- `bun run build` — compile TypeScript to `dist/` (required before CLI/server)
- `bun test` — run unit tests (vitest)
- `bun start` — start the HTTP server (requires `IMAGEGEN_API_TOKEN`)
- `imagegen` — run the CLI after `bun run build` and `bun link`
- `bun run typecheck` — type-check without emitting
- Hook script: `.agents/skills/imagegen/scripts/imagegen-hook.sh`

## File and directory rules

- Source files live in `src/`; use lower camel-case TypeScript filenames that
  match the exported responsibility, e.g. `generate.ts` or `privateCodex.ts`.
- Tests live in `tests/`; name test files `*.test.ts`.
- Generated API output stays under `outputs/`, `out/`, or `test-output/` and
  must not be committed.
- Request output directories follow
  `<output-root>/<local-yyyy-mm-dd>/<prompt-slug>[-n]/`.
- Generated image filenames are fixed: `image.png` for one result, or
  `image-1.png`, `image-2.png`, etc. for multiple results.

## Cross-surface feature parity

CLI, library API (`src/index.ts`), and HTTP server must stay
feature-equivalent for the core options: `prompt`, `number`,
`aspect_ratio`, `reference_file`. When adding/changing an option, update:
- `src/cli.ts` (flags + help)
- `src/generate.ts` (core implementation)
- `src/server.ts` (HTTP body handling)
- `src/index.ts` (library exports)
- Tests under `tests/`

Provider-specific limitations (the `codex-cli` provider does not wire
`--image` or size through to `codex exec`) must fail fast with a clear error,
never silently drop the option.

## Security

- HTTP server requires `IMAGEGEN_API_TOKEN` (min 16 chars) and binds to
  `127.0.0.1`. Never add an unauthenticated endpoint that drives the user's
  ChatGPT credentials.
- `reference_file` paths in the server are sandboxed to
  `IMAGEGEN_REFERENCE_ROOT`; symlinks are rejected. Do not remove this.
- Never log or print access tokens, account ids, or image payloads.
