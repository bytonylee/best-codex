# AGENTS.md — codex-status-bar

## Build & run

```bash
./build.sh                 # → build/CodexStatusBar.app
open -gj build/CodexStatusBar.app
```

Requires macOS 12+, Xcode/Swift command-line tools, Node.js.

## File and directory rules

- Swift app code lives in `Sources/`; use UpperCamelCase filenames that match
  the main type or responsibility, e.g. `StateStore.swift`.
- Hook scripts live in `hooks/`; use lowercase descriptive `.js` filenames.
- Tests live in `tests/`; name Swift tests `*Tests.swift` and hook contract
  tests `*.test.js`.
- Build outputs, screenshots, local logs, and generated packages stay out of
  the repo. Use `build/` or `/tmp` for local artifacts.
- Asset filenames should stay stable once referenced by `build.sh`,
  `Info.plist`, README files, or tests.

## Verify

- `swiftc -O -target arm64-apple-macos12.0 Sources/*.swift -o /tmp/test -framework Cocoa`
  must compile clean.
- `node hooks/install.js` merges into `~/.codex/hooks.json` (backs up first).
- End-to-end: `codex exec --dangerously-bypass-hook-trust ...` should drive
  `~/.codex/statusbar/state.json` through idle→thinking→tool→done.

## Architecture

Stateless poller. Codex hooks write `~/.codex/statusbar/state.json` plus
per-session payloads under `~/.codex/statusbar/session-state/`; the Swift app
polls every 0.4s and renders. Active session markers live in `sessions.d/`.
Programmatic styles (Orbit hexagon, CLI bullet pulse, Spark burst) are drawn with
`NSBezierPath` in `Sources/IconRenderer.swift`; the full-color character style
loads bundled PNG frames from `public/assets/character/bp`. Self-quits when no Codex
session is active (`sessions.d/` count == 0 and Codex desktop not running).

## Visual verification

This project uses `codex exec -m gpt-5.5 -c model_reasoning_effort="high" -i
<image>` to read screenshots (menu bar captures, app icon) since the build
agent cannot view images directly. Run:

```bash
screencapture -x -R "1500,0,1060,40" /tmp/menubar.png
codex exec -m gpt-5.5 -c model_reasoning_effort="high" --skip-git-repo-check \
  -s read-only "describe the menu bar icon" -i /tmp/menubar.png
```

## Key paths (Codex, not Claude)

- State: `~/.codex/statusbar/state.json`
- Active sessions: `~/.codex/statusbar/sessions.d/`
- Per-session state: `~/.codex/statusbar/session-state/`
- Hooks config: `~/.codex/hooks.json`
- Bundle ID: `com.local.codexstatusbar`
- Brand color: `#10A37F` (OpenAI/Codex green)
