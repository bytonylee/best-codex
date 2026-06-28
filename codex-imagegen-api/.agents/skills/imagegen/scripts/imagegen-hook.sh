#!/usr/bin/env bash
# imagegen-hook.sh — thin wrapper around the imagegen CLI for use as a hook
# script or shell pipeline entry point.
#
# Usage:
#   imagegen-hook.sh --prompt "a sunset" [--number 2] [--aspect_ratio 16:9] \
#     [--reference_file cat.png] [--output-dir ./outputs/generate] [--output-prefix sunset] \
#     [--provider private-codex|codex-cli|auto] [--dry-run] [--auth]
#
# All arguments are forwarded to `node dist/cli.js`. The script resolves the
# repo root from its own location so it can be invoked from any cwd.
# Requires `bun run build` to have been run first (compiles TypeScript to dist/).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"

if [ ! -f "$REPO_ROOT/dist/cli.js" ]; then
  echo "imagegen-hook.sh: could not locate dist/cli.js at $REPO_ROOT" >&2
  echo "  Run 'bun run build' first to compile TypeScript." >&2
  exit 1
fi

exec node "$REPO_ROOT/dist/cli.js" "$@"
