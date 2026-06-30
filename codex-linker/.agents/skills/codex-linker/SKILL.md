---
name: codex-linker
description: >-
  Use this skill when setting up, validating, or explaining codex-linker in
  this repository. It covers onboarding multiple Codex ChatGPT OAuth accounts
  with separate CODEX_HOME auth files, shared non-auth config symlinks,
  shell aliases, doctor checks, and optional usage/reset-ticket status checks.
---

# codex-linker

Set up multiple Codex CLI ChatGPT OAuth accounts on one machine while sharing
the same non-auth Codex configuration.

## Safety rules

- Never copy, symlink, print, or modify `auth.json`.
- Never run `status --api` unless the user explicitly asks for API-backed
  usage/reset-ticket checks.
- `doctor` is local filesystem validation only.
- `status` without `--api` is local-only and must not make network calls.
- Do not print access tokens, account IDs, raw private API payloads, or full
  auth file contents.

## One-time repo setup

From the repository root:

```bash
bun install
bun run build
bun link
```

## Three-account onboarding

Account 1 remains the default Codex home:

```text
~/.codex
```

Create secondary homes:

```bash
codex-linker setup --accounts 3
```

Login account 2 and account 3:

```bash
CODEX_HOME="$HOME/.codex-accounts/subs2" codex login
CODEX_HOME="$HOME/.codex-accounts/subs3" codex login
```

Link shared non-auth config and verify:

```bash
codex-linker link subs2
codex-linker link subs3
codex-linker doctor subs2
codex-linker doctor subs3
```

Install shell aliases:

```bash
codex-linker aliases --accounts 3 >> ~/.zshrc
source ~/.zshrc
```

Use the accounts:

```bash
codex1
codex2
codex3
```

## Status checks

Local auth presence only:

```bash
codex-linker status --accounts 3
```

Private ChatGPT usage and reset-ticket checks:

```bash
codex-linker status --accounts 3 --api
```

`--api` calls unofficial private ChatGPT endpoints and may break if those
endpoints change.

## Validation

Before reporting code changes complete:

```bash
bun run typecheck
bun run build
bun run test
```
