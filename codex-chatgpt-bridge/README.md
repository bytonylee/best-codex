<p align="center">
  <img src="./public/assets/readme/cc-bridge-character.png" alt="CC Bridge terminal mascot holding a bridge cable" width="140">
</p>

<h1 align="center">cc-bridge</h1>

<p align="center">
  <em>ChatGPT Developer Mode as a local repo bridge, with terminal-owned Codex handoff.</em>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-v0.1.0-111111?style=flat-square" alt="Version">
  <img src="https://img.shields.io/badge/license-MIT-111111?style=flat-square" alt="License: MIT">
  <a href="./package.json"><img src="https://img.shields.io/badge/Bun-%3E%3D1.3-111111?style=flat-square" alt="Bun >= 1.3"></a>
  <a href="./package.json"><img src="https://img.shields.io/badge/Node-runtime%20%3E%3D20-111111?style=flat-square" alt="Node.js runtime >= 20"></a>
</p>

<p align="center">
  <sub><a href="./README.md">English</a> &middot; <a href="./README.ko.md">한국어</a></sub>
</p>

---

<p align="center">
  <img src="./public/assets/readme/cc-bridge-hero.png" alt="cc-bridge terminal hero" width="100%">
</p>

`cc-bridge` is a TypeScript CLI and HTTP MCP server that lets ChatGPT
Developer Mode work inside one local repository. ChatGPT gets bounded tools
for reading, searching, editing, testing, saving generated images, and writing
a Codex handoff plan. Codex execution stays local: your terminal runs
`execute-handoff` or `watch-handoff`.

> `cc-bridge` is not a ChatGPT Web automation tool, model proxy, hosted
> service, or OS sandbox. It exposes selected local repo tools over MCP. Treat
> any connected MCP client as a trusted coding partner with access to that
> workspace.

**Tunnel mode always requires token auth. File operations are confined to one
realpath-resolved workspace root. Reads redact secret-looking values, writes
and edits reject secret-looking literals, and the `bash` tool only allows
verification commands plus bounded git inspection. Remote MCP tools never run
Codex directly.**

## Why this exists

ChatGPT Developer Mode can reason well about code, but it needs safe local
tools to inspect and change a real checkout. Codex is good at terminal-owned
execution, but a web ChatGPT session should not directly run your local agent.

`cc-bridge` keeps that boundary explicit:

- ChatGPT works through a small MCP tool surface.
- Local files stay under one configured workspace root.
- ChatGPT can write the bridge's current handoff plan.
- Your terminal decides whether and when Codex executes that plan.

## MCP tools

| Tool | Purpose | Notes |
|---|---|---|
| `server_config` | Show root, tunnel/auth mode, limits, and blocked globs | Useful first diagnostic |
| `open_workspace` | Load the single workspace, `AGENTS.md`, skills, git status, optional tree | Call once at session start |
| `tree` | Return a bounded workspace tree | Blocked paths are skipped |
| `search` | Search text inside the workspace | Results are bounded and redacted |
| `read` | Read text with line numbers | Secret-looking values are redacted |
| `write` | Create a file, or overwrite only with `overwrite:true` | Secret-looking literals are rejected |
| `edit` | Exact text replacement | Preferred for source changes |
| `bash` | Run allowlisted verification/git commands | No pipes, redirection, network, publish, or destructive commands |
| `git_status` | Return `git status --porcelain=v1` | Dedicated git review tool |
| `git_diff` | Return bounded `git diff` output | Only selected diff flags are accepted |
| `show_changes` | Return status plus diff stat | Use after edits |
| `load_skill` | Load a discovered `SKILL.md` | Bounded to discovered skills |
| `save_image_artifact` | Save base64 image data into the workspace | MIME-sniffed, defaults to `assets/generated/` |
| `render_save_image_widget` | Return a fallback image-save widget | For ChatGPT Apps-compatible hosts |
| `handoff_to_codex` | Write the current Codex handoff plan | Does not execute Codex |
| `read_handoff` | Read bridge plan/status/diff/log files | Redacts secret-looking values |

## CLI

Install dependencies, build TypeScript, and optionally link the binary:

```bash
bun install
bun run build
bun link
```

Start a local development server without auth:

```bash
cc-bridge start --no-auth
```

Start with token auth:

```bash
cc-bridge start --token "$(node -e "console.log(crypto.randomUUID())")"
```

Start with a public tunnel:

```bash
cc-bridge start --tunnel cloudflare
cc-bridge start --tunnel ngrok --ngrok-hostname your-domain.ngrok.app
```

Tunnel mode prints an MCP URL containing `?cc_bridge_token=...`. Paste that
URL into ChatGPT Developer Mode / Create Apps as a Streamable HTTP MCP server.
Do not publish the URL because the query token is a secret.

Run a dry handoff:

```bash
cc-bridge execute-handoff --dry-run
```

Execute the current handoff plan locally:

```bash
cc-bridge execute-handoff --yes
```

Watch for new plans and execute them:

```bash
cc-bridge watch-handoff --yes
```

Options:

```text
start:
  --root <path>                 Workspace root, default cwd
  --port <n>                    HTTP port, default 8787
  --host <host>                 Bind host, default 127.0.0.1
  --token <token>               Auth token, default random UUID
  --tunnel <mode>               none, cloudflare, or ngrok
  --ngrok-hostname <host>       Stable ngrok domain
  --no-auth                     Disable token auth, local only
  --include-plugin-skills       Include plugin cache skills

execute-handoff / watch-handoff:
  --root <path>                 Workspace root
  --agent <name>                Agent label, default codex
  --model <model>               Override handoff model
  --reasoning-effort <level>    low, medium, or high
  --command <cmd>               Override agent command for testing
  --dry-run                     Print command without executing
  --yes                         Skip confirmation
  --once                        watch-handoff only: run once and exit
```

## HTTP MCP server

The server binds to `127.0.0.1:8787` by default. In authenticated mode it
accepts either a bearer token or the `cc_bridge_token` query parameter.

List MCP tools:

```bash
curl -s -X POST http://127.0.0.1:8787/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

Health check:

```bash
curl -s http://127.0.0.1:8787/health
```

Endpoints:

- `POST /mcp`
- `GET /health`
- `GET /`

Environment:

| Variable | Default | Description |
|---|---|---|
| `CC_BRIDGE_ROOT` | cwd | Workspace root |
| `CC_BRIDGE_PORT` | `8787` | Listen port |
| `CC_BRIDGE_HOST` | `127.0.0.1` | Bind host |
| `CC_BRIDGE_TOKEN` | random UUID | MCP auth token |
| `CC_BRIDGE_TUNNEL` | `none` | `none`, `cloudflare`, or `ngrok` |
| `CC_BRIDGE_NGROK_HOSTNAME` | unset | Stable ngrok domain |
| `CC_BRIDGE_HANDOFF_MODEL` | `gpt-5.4-mini` | Default Codex handoff model |
| `CC_BRIDGE_HANDOFF_REASONING` | `medium` | `low`, `medium`, or `high` |
| `CC_BRIDGE_HANDOFF_COMMAND` | unset | Override local agent command |
| `CC_BRIDGE_INCLUDE_PLUGIN_SKILLS` | unset | Include plugin cache skills when set |

Errors are returned as MCP tool errors or HTTP JSON/text errors depending on
the endpoint. Unauthenticated `/mcp` requests return 401.

## Handoff layout

Handoff state is repo-owned and lives under the bridge context directory:

```text
current-plan.md
agent-status.md
codex-status.md
implementation-diff.patch
execution-log.jsonl
decisions.md
open-questions.md
```

`handoff_to_codex` writes `current-plan.md` and appends a JSONL event.
`execute-handoff` and `watch-handoff` read that plan, run the local command
only from your terminal, then write status files and a git diff patch.

Default execution:

```text
codex exec --model gpt-5.4-mini <plan_text>
```

`--dry-run` prints the command and logs the dry run without executing. In
non-interactive shells, live execution requires `--yes`.

## Library API

```js
import {
  createBridgeServer,
  resolveConfig,
  startListening
} from './dist/index.js';

const config = resolveConfig({ root: process.cwd(), noAuth: true });
const handle = createBridgeServer(config);

await startListening(handle, config);
console.log(handle.url());
```

<details>
<summary><strong>Full export surface</strong></summary>

The package exports the internal building blocks used by the CLI:
configuration helpers, workspace/path guards, safe bash validation, skill
discovery, image saving, handoff execution, widgets, filesystem operations,
MCP tool registration, server helpers, and tunnel launcher utilities. See
`src/index.ts` for the full export surface.

</details>

## For agents

One-time setup:

```bash
cd /path/to/codex-chatgpt-bridge
bun install
bun run build
bun link
```

Normal local flow:

```bash
cc-bridge start --tunnel cloudflare
```

Then connect the printed MCP URL in ChatGPT Developer Mode. A typical agent
session should:

1. Call `open_workspace`.
2. Inspect with `tree`, `search`, and `read`.
3. Modify with `edit` or `write`.
4. Verify with `bash` or dedicated git tools.
5. Call `show_changes`.
6. Use `handoff_to_codex` only when a local Codex execution plan is needed.

## Security

- Tunnel mode refuses `--no-auth`.
- Auth accepts bearer tokens or `?cc_bridge_token=...`.
- The root is realpath-resolved and all file operations stay inside it.
- Blocked globs cover git internals, environment files, private keys,
  SSH/AWS credential folders, dependency folders, build outputs, caches,
  coverage, and Codex auth files.
- Symlink escapes are rejected.
- Reads redact secret-looking values.
- Writes and edits reject secret-looking literals.
- `bash` blocks shell metacharacters, pipes, redirection, network commands,
  publish commands, destructive commands, auto-fix flags, absolute paths, home
  paths, and parent traversal.
- `git_diff` runs `git` without shell interpolation and only accepts selected
  diff flags.
- Image artifacts are MIME-sniffed, size-limited, and confined to the
  workspace.
- Remote MCP tools write Codex plans but never execute Codex.

## Tests

```bash
bun run typecheck
bun run build
bun run test
```

The suite covers config parsing, path confinement, blocked globs, symlink
escape rejection, secret redaction/detection, safe bash allowlists and
blocklists, git diff argument safety, skill discovery and skill file bounds,
image MIME sniffing and save behavior, handoff plan hashing/execution/watching,
HTTP MCP smoke flows, token auth, image saving, and URL building.

## Release

Current package version: `v0.1.0`.

`v0.1.0` includes the TypeScript CLI, stateless HTTP MCP server, one-root
workspace tools, safe bash policy, image artifact persistence, local-only
Codex handoff commands, tunnel helpers, and test coverage.

## License

MIT
