<p align="center">
  <img src="./public/assets/readme/codex-character.png" alt="codex-linker terminal character holding linked account cards" width="140">
</p>

<h1 align="center">codex-linker</h1>

<p align="center">
  <em>Switch multiple Codex ChatGPT accounts while sharing one local setup.</em>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-v0.0.1-111111?style=flat-square" alt="Version">
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-111111?style=flat-square" alt="License: MIT"></a>
  <a href="./package.json"><img src="https://img.shields.io/badge/Bun-%3E%3D1.3-111111?style=flat-square" alt="Bun"></a>
</p>

<p align="center">
  <sub><a href="./README.md">English</a> &middot; <a href="./README.ko.md">한국어</a></sub>
</p>

---

<p align="center">
  <img src="./public/assets/readme/codex-hero.png" alt="codex-linker multiple account terminal hero" width="100%">
</p>

Run multiple Codex CLI sessions with separate ChatGPT OAuth accounts while
sharing the same Codex config, MCP setup, skills, hooks, sessions, and history.

`codex-linker` keeps `auth.json` separate per account. It does not proxy Codex
traffic, parse tokens, refresh OAuth, or route quota automatically.

## Requirements

- Node.js 20+
- Codex CLI already installed
- Your first Codex account already logged in at `~/.codex`

## Install From This Checkout

```sh
bun install
bun run build
bun link
```

## Three-Account Setup

Account 1 stays in the default Codex home:

```text
~/.codex
```

Create homes for accounts 2 and 3:

```sh
codex-linker setup --accounts 3
```

Login the extra accounts with the commands printed by setup:

```sh
CODEX_HOME="$HOME/.codex-accounts/subs2" codex login
CODEX_HOME="$HOME/.codex-accounts/subs3" codex login
```

Link shared Codex files from `~/.codex`:

```sh
codex-linker link subs2
codex-linker link subs3
```

Check the homes before using them:

```sh
codex-linker doctor subs2
codex-linker doctor subs3
```

Install aliases:

```sh
codex-linker aliases --accounts 3 >> ~/.zshrc
source ~/.zshrc
```

Run Codex with each account:

```sh
codex1
codex2
codex3
```

Check local auth status without network calls:

```sh
codex-linker status --accounts 3
```

Check usage and reset-ticket status:

```sh
codex-linker status --accounts 3 --api
```

`--api` calls unofficial private ChatGPT endpoints:

```text
https://chatgpt.com/backend-api/wham/usage
https://chatgpt.com/backend-api/wham/rate-limit-reset-credits
```

Those endpoints may change without notice. `codex-linker` sends each account's
access token only in the `Authorization` header and never prints tokens,
account IDs, raw payloads, or `auth.json` contents.

## What Connects Where

```text
codex1 -> CODEX_HOME=$HOME/.codex
codex2 -> CODEX_HOME=$HOME/.codex-accounts/subs2
codex3 -> CODEX_HOME=$HOME/.codex-accounts/subs3
```

Each account connects through the same `codex` binary. The only difference is
`CODEX_HOME`, so each account uses its own ChatGPT OAuth file:

```text
~/.codex/auth.json
~/.codex-accounts/subs2/auth.json
~/.codex-accounts/subs3/auth.json
```

## What Is Shared

Everything top-level under `~/.codex` except `auth.json` is symlinked into each
secondary account home. That includes config, MCP files, skills, hooks,
sessions, and history if they exist.

## What Is Never Shared

`auth.json` is never symlinked, copied, printed, or modified by `codex-linker`.

## Recovery

Run doctor first:

```sh
codex-linker doctor subs2
codex-linker doctor subs3
```

If a non-auth target file conflicts with the shared source, either move it
manually or replace non-auth conflicts:

```sh
codex-linker link subs2 --force
codex-linker link subs3 --force
```

`--force` does not replace `auth.json`.

## Commands

```sh
codex-linker setup --accounts 3
codex-linker init subs2
codex-linker link subs2
codex-linker link subs2 --force
codex-linker doctor subs2
codex-linker alias subs2
codex-linker aliases --accounts 3
codex-linker status --accounts 3
codex-linker status --accounts 3 --api
```

## For agents

One-time setup to install and link `codex-linker`:

```bash
cd /path/to/codex-linker
bun install
bun run build
bun link
codex-linker setup --accounts 3
```

After setup, complete the user-driven OAuth login steps printed by
`codex-linker setup --accounts 3`, then link and verify the secondary homes:

```bash
codex-linker link subs2
codex-linker link subs3
codex-linker doctor subs2
codex-linker doctor subs3
codex-linker status --accounts 3
```

The repo-local agent skill lives in `.agents/skills/codex-linker/`. The
`.claude/skills/codex-linker` entry is a symlink to the same source, so Claude
Code and other `.claude`-aware tools pick it up without duplicating files.

## Security

- `auth.json` is never symlinked, copied, printed, or modified.
- Secondary homes keep their own ChatGPT OAuth auth files.
- Shared files come from the primary Codex home, excluding `auth.json`.
- `doctor` is local-only and does not call private APIs.
- `status --api` is explicit opt-in because it calls unofficial private
  ChatGPT endpoints.
- Access tokens, account IDs, raw API payloads, and auth file contents are
  never printed.

## Tests

```sh
bun run typecheck
bun run build
bun run test
```

The suite covers profile naming, setup rendering, symlink behavior, conflict
handling, doctor validation, alias rendering, local status checks, API-backed
status parsing, and token redaction.

## Release

Current version: `v0.0.1`

The `v0.0.1` version includes the CLI, three-account onboarding, linked
secondary Codex homes, doctor checks, alias generation, optional usage/reset
status checks, bilingual README files, and the repo-local agent skill.

## License

MIT
