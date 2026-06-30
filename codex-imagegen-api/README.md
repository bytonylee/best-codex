<p align="center">
  <img src="./public/assets/readme/codex-character.png" alt="Codex terminal mascot drawing a picture" width="140">
</p>

<h1 align="center">imagegen-api</h1>

<p align="center">
  <em>Codex image generation as a native API, CLI, and local HTTP server.</em>
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
  <img src="./public/assets/readme/codex-hero.png" alt="imagegen-api Codex terminal hero" width="100%">
</p>

Fast image generation through the user's local Codex ChatGPT login. The same
core options — `prompt`, `number`, `aspect_ratio`, `reference_file` — work
across a CLI, library API, and optional local HTTP server. Pure
Node.js-compatible runtime, standard library only, no runtime dependencies.
Install and run with `bun`.

> This project calls a private Codex backend path using tokens stored by
> `codex login`. It is not an officially supported OpenAI API and may change
> without notice. Image generations count against the user's ChatGPT plan.

**The `codex-cli` provider fails fast on `--reference_file` and `--size`
rather than silently dropping them. `auto` refuses fallback when it would drop
user intent. Server `reference_file` paths and output roots stay sandboxed.
Auth tokens and image payloads are never logged.**

## Why this exists

Agent workflows often need image output without switching surfaces. The direct
private Codex path is fast and supports reference images, aspect ratio, and
multi-image generation. The `codex-cli` path is slower but useful as a fallback
when the private HTTP path is unavailable.

## Providers

| Provider | Transport | Reference images | Size | Multi-image | Notes |
|---|---|---|---|---|---|
| `codex` | Direct HTTPS to Codex backend | Yes (`-r`) | Yes (`-a`) | Yes (`-n`) | Default and fastest path |
| `codex-cli` | `codex exec` subprocess | Not wired | Not wired | No | Codex CLI supports `--image` natively; this provider does not pass it through. Describe references and size in the prompt text instead. |
| `auto` | Private first, CLI fallback | Yes on private path | Yes on private path | Yes on private path | Refuses fallback when `--` flags would be dropped |

The `codex-cli` provider drives `codex exec` with a text prompt only. Codex
CLI itself supports `--image, -i` for reference images, but this provider does
not wire that flag through — it fails fast with `UNSUPPORTED_IMAGES` if you
pass `--reference_file`. There is no size flag in Codex CLI; describe the
desired aspect ratio in the prompt text (e.g. "a 16:9 landscape of a cat").
Multi-image is not supported (one `codex exec` run produces one image).

The `auto` provider refuses fallback to `codex-cli` when `--reference_file`,
`--aspect_ratio`/`--size` (non-`auto`), or `--number > 1` are set, because the
`codex-cli` provider would drop that structured intent:

- `SIZE_UNSUPPORTED_BY_FALLBACK`
- `IMAGES_UNSUPPORTED_BY_FALLBACK`
- `NUMBER_UNSUPPORTED_BY_FALLBACK`

## CLI

Build the TypeScript first and link the local binary once:

```bash
bun run build
bun link
```

Check auth first:

```bash
imagegen --auth
```

Generate one image:

```bash
imagegen -p "a Korean man taking a selfie in front of a full-body mirror inside a cafe" -o ./outputs/generate
```

Generate two images at 16:9:

```bash
imagegen -p "a friendly robot waving in a neon-lit cyberpunk alley at night" -n 2 -a 16:9 -o ./outputs/generate
```

Use a reference image:

```bash
imagegen -p "make this cat wear a knitted winter hat with a pom-pom" -r ./cat.png -o ./outputs/generate
```

Run a dry request shape check without calling the backend:

```bash
imagegen -p "a flat blue square icon with rounded corners, minimal, on white background" --dry-run
```

Options:

```text
-p, --prompt <text>          Required image prompt
-n, --number <int>           Image count, 1 to 4
-a, --aspect_ratio <ratio>   1:1, 3:2, 2:3, 16:9, 9:16, 4:3, 3:4, auto, or raw size
-r, --reference_file <path>  Reference image path, repeatable
-o, --output-dir <dir>       Output root; final directory and filenames are generated
-m, --model <name>           Model name
--provider <name>            codex, codex-cli, or auto
--dry-run                    Validate auth and print request shape
--auth                       Check Codex ChatGPT auth status
```

<details>
<summary><strong>Supported raw sizes &amp; reference formats</strong></summary>

Supported raw sizes: `1024x1024`, `1536x1024`, `1024x1536`, `2048x2048`,
`2048x1152`, `3840x2160`, `2160x3840`, `auto`. Reference files may be
`png`, `jpg`, `jpeg`, `gif`, or `webp`. `--output-prefix` is rejected;
filenames are generated by the API.

</details>

On success the CLI prints JSON:

```json
{
  "provider": "codex",
  "count": 2,
  "images": [
    { "savedPath": "...", "relativePath": "...", "revisedPrompt": "...",
      "responseId": "...", "sessionId": "..." }
  ],
  "outputRoot": "...",
  "outputDir": "...",
  "relativeOutputDir": "...",
  "slug": "..."
}
```

## HTTP Server

The server is local-only by default and requires a bearer token.

```bash
bun run build
export IMAGEGEN_API_TOKEN="$(node -e "console.log(require('crypto').randomBytes(24).toString('hex'))")"
bun start
```

Generate through HTTP:

```bash
curl -X POST http://127.0.0.1:8787/generate \
  -H "Authorization: Bearer $IMAGEGEN_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"prompt":"a Korean man taking a selfie in front of a full-body mirror inside a cafe","aspect_ratio":"16:9","number":2}'
```

Endpoints:

- `POST /generate`
- `GET /health`

`POST /generate` accepts `prompt`, `number`, `aspect_ratio`, and
`reference_file`. `output_dir` and `output_prefix` are rejected with
`OUTPUT_DIR_UNSUPPORTED` / `OUTPUT_PREFIX_UNSUPPORTED`; output locations are
server-owned.

Environment:

| Variable | Default | Description |
|---|---|---|
| `IMAGEGEN_API_TOKEN` | Required | Bearer token, minimum 16 characters |
| `IMAGEGEN_PORT` | `8787` | Listen port |
| `IMAGEGEN_HOST` | `127.0.0.1` | Bind host |
| `IMAGEGEN_REFERENCE_ROOT` | cwd | Sandbox root for reference files |
| `IMAGEGEN_OUTPUT_ROOT` | `<cwd>/outputs` | Root for generated output |
| `IMAGEGEN_MAX_BODY_BYTES` | `10485760` | Request body cap |
| `IMAGEGEN_PROVIDER` | `codex` | Default provider |
| `IMAGEGEN_MODEL` | `gpt-5.4` | Model name |
| `CODEX_HOME` | `~/.codex` | Codex config directory |

Error responses are JSON with `error`, `code`, and — when a generation failed
partway — the partial result fields (`outputRoot`, `outputDir`,
`relativeOutputDir`, `slug`, `images`). Status codes map from error codes:
`AUTH_EXPIRED` → 401, `RATE_LIMITED` → 429, validation errors → 400,
`BODY_TOO_LARGE` → 413, otherwise 500.

## Output layout

Generated output is server-owned and identical across CLI, HTTP, and library
surfaces. Each live request gets a new immutable directory:

```text
<output-root>/<local-yyyy-mm-dd>/<prompt-slug>/
<output-root>/<local-yyyy-mm-dd>/<prompt-slug>-2/
<output-root>/<local-yyyy-mm-dd>/<prompt-slug>-3/
```

`prompt-slug` is built from the first 15 prompt words, lowercased to ASCII,
with unsupported characters replaced by `-`, repeated separators collapsed,
trailing separators trimmed, and capped at 80 characters. If no ASCII slug
remains, `image` is used.

Directory allocation is atomic: the base directory is created first, then
`-2`, `-3`, and so on, up to 1,000 attempts. Existing files are never
overwritten. Multi-image generation writes sequentially and keeps any images
already saved if a later image fails (returned as the partial result).

Filenames inside a request directory are fixed:

```text
number = 1: image.png
number > 1: image-1.png, image-2.png, image-3.png, image-4.png
```

Responses include absolute paths plus POSIX-style relative paths from the
output root. `--dry-run` does not create or reserve directories; it reports
the unsuffixed planned path and warns that a live run may receive a numeric
suffix.

## Library API

```js
import { generateImage, resolveConfig } from './dist/index.js';

const config = resolveConfig();
const result = await generateImage({
  prompt: 'a Korean man taking a selfie in front of a full-body mirror inside a cafe',
  number: 2,
  aspect_ratio: '16:9',
  outputDir: './outputs/generate',
  config
});

console.log(result.images.map((image) => image.savedPath));
```

Each generation request has a 5-minute timeout. Reference files are read as
base64 data URLs and shared across all N requests in a call.

<details>
<summary><strong>Full export surface</strong></summary>

The package also exports the building blocks used internally: `createProvider`
(`codex` / `codex-cli` / `auto`), `normalizeGenerationOptions`,
`normalizeNumber`, `normalizeReferenceFile`, `resolveAspectRatio`,
`ASPECT_RATIO_TO_SIZE`, `SUPPORTED_SIZES`, `buildRequest`, `createSseParser`,
`extractImage`, `readImageAsDataUrl`, output helpers (`planOutputPaths`,
`allocateOutputPaths`, `slugFromPrompt`, `imageFilename`), and the server
utilities `createHandler`, `sandboxReferencePath`, `sandboxOutputDir`,
`DEFAULT_MAX_BODY_BYTES`. See `src/index.ts` for the full export surface.

</details>

## Agent Skill

The agent skill lives in `.agents/skills/imagegen/` (the default agent config
directory). The `.claude/skills/imagegen` entry is a symlink to the same
source, so Claude Code and other `.claude`-aware tools pick it up without
duplicating files.

```bash
.agents/skills/imagegen/scripts/imagegen-hook.sh -p "a Korean man taking a selfie in front of a full-body mirror inside a cafe" -o ./outputs/generate
```

The hook resolves the repository root from its own location, so it can be
called from shell pipelines or other tools.

## For agents

One-time setup to install and link the `imagegen` CLI:

```bash
cd /path/to/codex-imagegen-api
bun install
bun run build
bun link
imagegen --auth
```

After setup, generate images with `imagegen` — no server required:

```bash
imagegen -p "a Korean man taking a selfie in front of a full-body mirror inside a cafe" -o ./outputs/generate
```

## Security

- The HTTP server refuses to start without `IMAGEGEN_API_TOKEN`.
- The server binds to `127.0.0.1` by default.
- `reference_file` is sandboxed to `IMAGEGEN_REFERENCE_ROOT`.
- Generated output is saved under `IMAGEGEN_OUTPUT_ROOT`.
- Symlinked path components are rejected (reference and output roots).
- Request bodies are capped at 10 MiB by default.
- Auth tokens are compared in constant time to avoid timing leaks.
- Auth tokens, account ids, and image payloads are never printed.
- `codex-cli` fallback refuses to guess across generated image sessions.

## Tests

```bash
bun test
```

The suite covers config resolution, request building, SSE parsing, image
extraction, provider fallback (including refusal cases), CLI validation,
output path allocation and slug generation, HTTP auth, path sandboxing, body
limits, and error response codes.

## Release

Current tag: [`v0.0.1`](https://github.com/bytonylee/imagegen-api/releases/tag/v0.0.1)

The `v0.0.1` release includes the CLI, library API, local HTTP server,
provider fallback layer, server-owned output layout with atomic allocation,
Devin skill wrapper, security sandboxing, and unit tests.

## License

MIT
