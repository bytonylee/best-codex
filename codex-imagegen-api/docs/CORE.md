# imagegen-api — Core Provider Comparison

This document compares the two image-generation modes (private HTTP "app
server" vs. headless `codex exec` CLI), records the live test results,
and states the recommended default.

## Mode comparison

| Concern | codex (app server) | codex-cli (headless) |
|---|---|---|
| Transport | direct HTTPS to `/backend-api/codex/responses` | spawn `codex exec` subprocess |
| Auth | reuses `~/.codex/auth.json` tokens in headers | `codex` binary reads the same auth itself |
| Reference images | yes (base64 data URLs) | not wired (Codex CLI supports `--image, -i` natively, but this provider does not pass it through; fails fast with `UNSUPPORTED_IMAGES`) |
| Output size | yes (`--size`) | not wired (no size flag in Codex CLI; describe in prompt text; this provider fails fast with `UNSUPPORTED_SIZE`) |
| Multi-image (`--number`) | yes (one request per image) | no (single image per `codex exec` run) |
| Latency | low (single HTTP round-trip, streamed) | high (full agent loop, file system scan) |
| Memory | streams SSE incrementally | buffers subprocess stdout/stderr |
| Failure modes | 401/HTTP errors, expired token, no image in stream | no PNG found, bwrap/sandbox warnings, not logged in |
| Robustness | depends on private backend contract | depends on `codex` CLI behavior + generated_images layout |
| Best for | fast, feature-rich generation | fallback when private HTTP is down/blocked |

## Approach

This project keeps the codex path as the default and fastest mode,
adds the codex-cli headless provider, and adds an `auto` mode that falls
back. Key features:

- **HTTP server** (`src/server.ts`): exposes `POST /generate` with
  `prompt`, `number`, `aspect_ratio`, `reference_file`. Secured with a
  required bearer token (`IMAGEGEN_API_TOKEN`), loopback bind, body size
  cap, and `reference_file` path sandboxing (rejects paths outside the
  reference root and rejects symlinks).
- **CLI** exposes `--prompt`/`--number`/`--aspect_ratio`/
  `--reference_file` and adds `--provider`.
- **Skill + hook** live in `.agents/skills/imagegen/` (default agent config
  directory) with a `SKILL.md` and a `imagegen-hook.sh` wrapper. A
  `.claude/skills/imagegen` symlink points to the same source so
  `.claude`-aware tools pick it up without duplication.

## Live test results (8 runs, different strategies)

All runs used the user's existing `~/.codex/auth.json` (auth_mode=chatgpt).
Output saved under `outputs/test-output/`.

| # | Strategy | Provider | Params | Result | Notes |
|---|---|---|---|---|---|
| 1 | baseline square | codex | `-p "a flat blue square icon"` | `orig-test1.png` 1254x1254 | clean, fast |
| 2 | CLI default | codex | `-p "a friendly robot"` | `orig-test2-cli.png` 1254x1254 | clean |
| 3 | landscape aspect | codex | `-p "a sunset over mountains" -a 16:9` | `landscape.png` 1942x809 | aspect honored |
| 4 | portrait aspect | codex | `-p "a futuristic city" -a 9:16` | `city-portrait.png` 864x1821 | aspect honored |
| 5 | multi-image | codex | `-p "a friendly robot" -n 2` | `robot-1.png`, `robot-2.png` | both 1254x1254 |
| 6 | reference image | codex | `-p "make this red" -r red-square.png` | `red-square.png` 1254x1254 | reference accepted |
| 7 | default output | codex | `-p "a flat blue square icon"` | `image.png` 1254x1254 | default prefix |
| 8 | dry-run | codex | `--dry-run` | JSON request shape, no network | auth validated |

Observations:
- codex is consistently fast (single streamed request) and honors
  aspect ratio, reference images, and multi-image.
- The codex-cli path was exercised via unit tests with an injected
  `execImpl` (no real `codex exec` run) to avoid mutating the user's
  `~/.codex/generated_images/` during review.
- No stream instability observed across 8 runs; the SSE parser handled
  every response.

## Decision

**Default to `codex`.** It is faster, supports the full feature
set (`number`, `aspect_ratio`, `reference_file`), and has lower memory
overhead via incremental SSE parsing. Use `codex-cli` only as a fallback
when the private HTTP path is unavailable, and use `auto` to get that
fallback automatically — with the explicit guard that fallback is refused
when `--aspect_ratio`/size or `--reference_file` are set, so the user's
intent is never silently dropped.

## Output strategy

Generated output is server-owned by default and shared across HTTP, CLI, and
library surfaces. The output root is selected as follows:

- HTTP uses `IMAGEGEN_OUTPUT_ROOT`, defaulting to `<server-startup-cwd>/outputs`.
- CLI/library use `outputDir` / `--output-dir` as the output root, defaulting to
  `IMAGEGEN_OUTPUT_ROOT` or `<process-cwd>/outputs`.
- `output_prefix` / `--output-prefix` / `outputPrefix` are rejected. Callers do
  not control final filenames.

Each live request creates a new immutable request directory:

```text
<output-root>/<local-yyyy-mm-dd>/<prompt-slug>/
<output-root>/<local-yyyy-mm-dd>/<prompt-slug>-2/
<output-root>/<local-yyyy-mm-dd>/<prompt-slug>-3/
```

`prompt-slug` is built from the first 15 prompt words, converted to lowercase
ASCII, with unsupported characters replaced by `-`, repeated separators
collapsed, trailing separators trimmed, and the final slug capped at 80
characters. If no ASCII slug remains, `image` is used.

Directory allocation is atomic: the implementation attempts to create the base
directory, then `-2`, `-3`, and so on, with a hard cap of 1,000 attempts.
Existing output files are never overwritten. Multi-image generation writes
sequentially and preserves already saved files if a later image fails.

Filenames inside a request directory are fixed:

```text
number = 1: image.png
number > 1: image-1.png, image-2.png, image-3.png, image-4.png
```

The `index` field in API results remains zero-based for compatibility. Live
responses include absolute paths plus POSIX-style relative paths from the
output root. Dry-run does not create or reserve directories; it reports the
unsuffixed planned path and warns that a live run may receive a numeric suffix.

## Security notes

- The HTTP server requires `IMAGEGEN_API_TOKEN` (min 16 chars) and binds to
  `127.0.0.1`. Without the token the server refuses to start.
- `reference_file` is sandboxed to `IMAGEGEN_REFERENCE_ROOT` (default:
  server's cwd). Symlinks are rejected.
- HTTP output is sandboxed to `IMAGEGEN_OUTPUT_ROOT`. The output root itself is
  resolved once with `realpath`; symlink components under it are rejected.
- Request bodies are capped at `IMAGEGEN_MAX_BODY_BYTES` (default 10 MiB).
- Auth tokens are compared in constant time to avoid timing leaks.
- The CLI does not print tokens; `--auth` only reports presence/absence.
