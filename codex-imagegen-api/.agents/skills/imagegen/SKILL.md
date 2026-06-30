---
name: imagegen
description: >-
  Use this skill whenever the user asks to generate, create, render, draw, or
  make an image, picture, illustration, icon, logo, or any other visual asset.
  Also use it when the user wants to edit, modify, restyle, or combine
  existing images (provide them as reference_file inputs). The skill drives
  the `imagegen` CLI in this repo, which uses the user's local Codex
  ChatGPT authentication to call the private image-generation backend.
  Trigger phrases include "generate an image", "create a picture", "make an
  image of", "draw me a", "render this", "make this cat wear a hat", and
  similar. Prefer this skill over describing images in text.
---

# imagegen

Generate images from text prompts (and optional reference images) by running
the `imagegen` CLI shipped in this repository (`dist/cli.js`).

## How to invoke

Run the CLI from the repo root. It is not published to npm; invoke it via
`bun run cli` (or `bun run cli`). The TypeScript source must be
compiled first with `bun run build`.

### Basic generation

```bash
bun run build
bun run cli --prompt "flat blue square icon" --output-dir ./outputs/generate
```

### With reference images

Pass `--reference_file <path>` (or `-r`) one or more times to use existing
images as input. Supported formats: `png`, `jpg`/`jpeg`, `gif`, `webp`.

```bash
bun run cli -p "Make this cat wear a hat" -r ./cat.png -o ./outputs/generate --output-prefix cat-hat
```

### Aspect ratio / size

Pass `--aspect_ratio <ratio>` (or `-a`). Accepts `1:1`, `3:2`, `2:3`, `16:9`,
`9:16`, `4:3`, `3:4`, `auto`, or a raw size like `1536x1024`, `2048x1152`,
`3840x2160`, `2160x3840`.

```bash
bun run cli -p "a sunset over mountains" -a 16:9 -o ./outputs/generate --output-prefix sunset
```

### Number of images

Pass `--number <int>` (or `-n`) to generate up to 4 images in one call
(private-codex provider only).

```bash
bun run cli -p "a friendly robot" -n 2 -o ./outputs/generate --output-prefix robot
```

### Provider selection

Pass `--provider <name>`:

- `private-codex` (default): direct HTTP to the private Codex backend. Fast,
  supports `--number`, `--aspect_ratio`, and `--reference_file`.
- `codex-cli`: headless `codex exec` fallback. No reference images, no size
  selection. Useful when the private HTTP path is rate-limited or down.
- `auto`: try `private-codex` first, fall back to `codex-cli` on failure.
  Fallback is refused when `--number > 1`, `--aspect_ratio`/size, or
  `--reference_file` are set (codex-cli cannot honor those, so we fail fast
  rather than silently drop them).

```bash
bun run cli --provider codex-cli -p "a red square" -o ./outputs/generate --output-prefix red
```

### Dry run

Validate auth and print the request shape without calling the backend.

```bash
bun run cli -p "flat blue square icon" --dry-run
```

## Required arguments

- `--prompt <text>` (or `-p`) — required text prompt
- `--output-dir <dir>` (or `-o`) — directory to save images (default: cwd)

## Prerequisites the agent must check

**All providers require the codex CLI authenticated via ChatGPT
subscription OAuth.** This is non-negotiable — no API keys, no service
accounts, no fabricated auth.

1. The `codex` binary must be on `PATH`. If missing, stop and tell the user
   to install Codex — do **not** try to install it for them.
2. The codex CLI must be logged in via ChatGPT subscription OAuth. Verify
   with `codex login status` (must show "Logged in using ChatGPT"). If it
   shows API key auth or is not logged in, stop and tell the user to run
   `codex login` and choose the ChatGPT option.
3. Confirm `~/.codex/auth.json` exists with `auth_mode = chatgpt`. Verify
   with `bun run cli --auth`. If missing or wrong auth_mode, stop and
   tell the user — do **not** fabricate auth state.

These checks apply regardless of which `--provider` is selected. The
`private-codex` provider reuses the same ChatGPT OAuth token from
`~/.codex/auth.json`; the `codex-cli` provider drives `codex exec` directly.
Both depend on a valid ChatGPT subscription OAuth session.

## After running

`imagegen` saves PNG(s) to `--output-dir` and prints a JSON summary that
includes `savedPath` for each image. Report `savedPath` back to the user.

## Hook script

A convenience hook script is provided at
`.agents/skills/imagegen/scripts/imagegen-hook.sh` that wraps the CLI with
sensible defaults and streams the JSON result to stdout. It is intended to be
called from other tools or shell pipelines.
