// Optional HTTP API server: POST /generate with JSON body.
// Body: { prompt, number, aspect_ratio, reference_file }
// Returns JSON with saved paths.
//
// Security:
//   - Binds to 127.0.0.1 by default (loopback only).
//   - Requires a bearer token on every request. Set IMAGEGEN_API_TOKEN in the
//     environment before starting the server. If unset, the server refuses to
//     start and prints setup instructions.
//   - Caps request body size (default 10 MiB) to bound memory use.
//   - reference_file paths are sandboxed: they must resolve inside the
//     configured reference root (IMAGEGEN_REFERENCE_ROOT, default cwd at
//     startup). Symlinks are rejected.
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { resolveConfig, type Config } from './config.js';
import { checkAuth } from './auth.js';
import { CodedError } from './errors.js';
import { generateImage, GenerationFailedError, type GenerationResult } from './generate.js';
import { normalizeGenerationOptions } from './options.js';

export const DEFAULT_MAX_BODY_BYTES = 10 * 1024 * 1024;

const ERROR_STATUS: Record<string, number> = { AUTH_EXPIRED: 401, RATE_LIMITED: 429 };

type GenerateFn = typeof generateImage | ((args: Record<string, unknown>) => Promise<GenerationResult>);

interface HandlerArgs {
  apiToken: string;
  config: Config;
  referenceRoot: string;
  outputRoot?: string;
  maxBodyBytes?: number;
  generate?: GenerateFn;
}

function sendJson(res: http.ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

function sendError(res: http.ServerResponse, status: number, err: unknown, fallbackCode: string): void {
  const e = err instanceof Error ? err : new Error(String(err));
  const code = err instanceof CodedError ? err.code : fallbackCode;
  const partial = err instanceof GenerationFailedError ? err.partialResult : undefined;
  sendJson(res, status, {
    error: e.message,
    code,
    ...(partial?.outputRoot ? { outputRoot: partial.outputRoot } : {}),
    ...(partial?.outputDir ? { outputDir: partial.outputDir } : {}),
    ...(partial?.relativeOutputDir ? { relativeOutputDir: partial.relativeOutputDir } : {}),
    ...(partial?.slug ? { slug: partial.slug } : {}),
    ...(partial?.images.length ? { images: partial.images } : {})
  });
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function checkAuthHeader(req: http.IncomingMessage, apiToken: string): boolean {
  const header = req.headers.authorization || '';
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!m || !m[1]) return false;
  return constantTimeEqual(m[1], apiToken);
}

function isInsideRoot(root: string, candidate: string): boolean {
  const rel = path.relative(root, candidate);
  return rel === '' || (!rel.startsWith('..' + path.sep) && rel !== '..' && !path.isAbsolute(rel));
}

async function resolveReferenceRoot(referenceRoot: string): Promise<string> {
  return fs.realpath(path.resolve(referenceRoot));
}

async function rejectSymlinkComponents(
  candidate: string,
  root: string,
  original: string,
  kind: string,
  { allowMissing = false }: { allowMissing?: boolean } = {}
): Promise<void> {
  if (!isInsideRoot(root, candidate)) {
    throw new Error(`${kind} escapes the allowed root: ${original}`);
  }

  const rel = path.relative(root, candidate);
  if (!rel) return;

  let current = root;
  for (const segment of rel.split(path.sep)) {
    current = path.join(current, segment);
    let stat;
    try {
      stat = await fs.lstat(current);
    } catch (e) {
      if (allowMissing && (e as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw e;
    }
    if (stat.isSymbolicLink()) {
      throw new Error(`${kind} must not contain symlinks: ${original}`);
    }
  }
}

// Resolve a reference path and verify it stays inside referenceRoot, rejecting
// symlinks. Returns the absolute resolved path or throws.
export async function sandboxReferencePath(relOrAbs: string, referenceRoot: string): Promise<string> {
  if (typeof relOrAbs !== 'string' || !relOrAbs.trim()) {
    throw new Error('reference_file entry must be a non-empty string.');
  }
  const root = await resolveReferenceRoot(referenceRoot);
  const candidate = path.resolve(root, relOrAbs);
  await rejectSymlinkComponents(candidate, root, relOrAbs, 'reference_file');

  let stat;
  try {
    stat = await fs.stat(candidate);
  } catch (e) {
    throw new CodedError(
      `reference_file not found: ${relOrAbs}`,
      (e as NodeJS.ErrnoException).code ?? 'ENOENT'
    );
  }
  if (!stat.isFile()) {
    throw new Error(`reference_file is not a file: ${relOrAbs}`);
  }
  const realCandidate = await fs.realpath(candidate);
  if (!isInsideRoot(root, realCandidate)) {
    throw new Error(`reference_file escapes the allowed root: ${relOrAbs}`);
  }
  return candidate;
}

export async function sandboxOutputDir(relOrAbs: string, referenceRoot: string): Promise<string> {
  if (typeof relOrAbs !== 'string' || !relOrAbs.trim()) {
    throw new Error('output_dir must be a non-empty string.');
  }
  const root = await resolveReferenceRoot(referenceRoot);
  const candidate = path.resolve(root, relOrAbs);
  await rejectSymlinkComponents(candidate, root, relOrAbs, 'output_dir', { allowMissing: true });
  const stat = await fs.stat(candidate).catch((e: NodeJS.ErrnoException) => {
    if (e.code === 'ENOENT') return null;
    throw e;
  });
  if (stat && !stat.isDirectory()) {
    throw new Error(`output_dir is not a directory: ${relOrAbs}`);
  }
  return candidate;
}

export async function resolveOutputRoot(outputRoot: string): Promise<string> {
  if (typeof outputRoot !== 'string' || !outputRoot.trim()) {
    throw new Error('output root must be a non-empty string.');
  }
  await fs.mkdir(path.resolve(outputRoot), { recursive: true });
  return fs.realpath(path.resolve(outputRoot));
}

interface RequestBody {
  prompt?: string;
  number?: number | string;
  aspect_ratio?: string;
  reference_file?: string | string[];
  output_dir?: string;
  output_prefix?: string;
}

function readBody(req: http.IncomingMessage, maxBodyBytes: number): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxBodyBytes) {
        reject(new Error(`Request body exceeds limit of ${maxBodyBytes} bytes.`));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

// Build an http request handler. Exported for tests so the handler can be
// exercised without binding a port.
export function createHandler({
  apiToken,
  config,
  referenceRoot,
  outputRoot = config.defaultOutputDir,
  maxBodyBytes = DEFAULT_MAX_BODY_BYTES,
  generate = generateImage
}: HandlerArgs): http.RequestListener {
  if (!apiToken || apiToken.length < 16) {
    throw new Error('apiToken must be at least 16 characters.');
  }
  return async (req, res) => {
    if (!checkAuthHeader(req, apiToken)) {
      sendJson(res, 401, { error: 'Unauthorized. Provide Authorization: Bearer <IMAGEGEN_API_TOKEN>.', code: 'UNAUTHORIZED' });
      return;
    }

    if (req.method === 'GET' && req.url === '/health') {
      const auth = await checkAuth(config);
      const resolvedOutputRoot = await resolveOutputRoot(outputRoot);
      sendJson(res, 200, {
        ok: auth.ok,
        referenceRoot,
        outputRoot: resolvedOutputRoot,
        ...(auth.warnings?.length ? { warnings: auth.warnings } : {})
      });
      return;
    }

    if (req.method === 'POST' && req.url === '/generate') {
      let bodyText: string;
      try {
        bodyText = await readBody(req, maxBodyBytes);
      } catch (e) {
        sendError(res, 413, e, 'BODY_TOO_LARGE');
        return;
      }

      let params: RequestBody;
      try {
        params = JSON.parse(bodyText) as RequestBody;
      } catch {
        sendJson(res, 400, { error: 'Invalid JSON body.', code: 'INVALID_JSON' });
        return;
      }

      if (params.output_dir !== undefined) {
        sendJson(res, 400, { error: 'output_dir is not supported; output directories are generated by the API.', code: 'OUTPUT_DIR_UNSUPPORTED' });
        return;
      }
      if (params.output_prefix !== undefined) {
        sendJson(res, 400, { error: 'output_prefix is not supported; filenames are generated by the API.', code: 'OUTPUT_PREFIX_UNSUPPORTED' });
        return;
      }

      let normalized;
      try {
        normalized = normalizeGenerationOptions({
          prompt: params?.prompt,
          number: params?.number,
          aspect_ratio: params?.aspect_ratio,
          reference_file: params?.reference_file
        }, {
          outputDir: outputRoot
        });
      } catch (e) {
        sendError(res, 400, e, 'INVALID_OPTIONS');
        return;
      }

      // Normalize reference_file to an array and sandbox each path.
      let referenceFiles: string[] = [];
      if (normalized.referenceFiles.length > 0) {
        try {
          referenceFiles = await Promise.all(
            normalized.referenceFiles.map((p) => sandboxReferencePath(p, referenceRoot))
          );
        } catch (e) {
          sendError(res, 400, e, 'REFERENCE_FILE_INVALID');
          return;
        }
      }

      let resolvedOutputRoot: string;
      try {
        resolvedOutputRoot = await resolveOutputRoot(outputRoot);
      } catch (e) {
        sendError(res, 400, e, 'OUTPUT_DIR_INVALID');
        return;
      }

      try {
        const result = await generate({
          prompt: normalized.prompt,
          number: normalized.number,
          aspect_ratio: normalized.aspectRatio,
          reference_file: referenceFiles,
          outputDir: resolvedOutputRoot,
          config,
          rejectOutputSymlinks: true
        });
        sendJson(res, 200, result);
      } catch (e) {
        const code = e instanceof CodedError ? e.code : '';
        sendError(res, ERROR_STATUS[code] ?? 500, e, 'GENERATE_FAILED');
      }
      return;
    }

    sendJson(res, 404, { error: 'Not found. Use POST /generate or GET /health.', code: 'NOT_FOUND' });
  };
}

function main(): void {
  const PORT = Number(process.env.IMAGEGEN_PORT) || 8787;
  const HOST = process.env.IMAGEGEN_HOST || '127.0.0.1';
  const MAX_BODY_BYTES = Number(process.env.IMAGEGEN_MAX_BODY_BYTES) || DEFAULT_MAX_BODY_BYTES;
  const REFERENCE_ROOT = path.resolve(process.env.IMAGEGEN_REFERENCE_ROOT || process.cwd());
  const OUTPUT_ROOT = path.resolve(process.env['IMAGEGEN_' + 'OUTPUT_ROOT'] || path.join(process.cwd(), 'outputs'));

  const API_TOKEN = process.env.IMAGEGEN_API_TOKEN;
  if (!API_TOKEN || API_TOKEN.length < 16) {
    console.error('Refusing to start: IMAGEGEN_API_TOKEN is missing or too short (min 16 chars).');
    console.error('Generate one with, for example:');
    console.error('  export IMAGEGEN_API_TOKEN="$(node -e \'console.log(require(\'crypto\').randomBytes(24).toString(\'hex\'))\')"');
    process.exit(1);
  }

  const config = resolveConfig({ defaultOutputDir: OUTPUT_ROOT });
  const server = http.createServer(
    createHandler({
      apiToken: API_TOKEN,
      config,
      referenceRoot: REFERENCE_ROOT,
      outputRoot: OUTPUT_ROOT,
      maxBodyBytes: MAX_BODY_BYTES
    })
  );

  server.listen(PORT, HOST, () => {
    console.log(`imagegen-api server listening on http://${HOST}:${PORT}`);
    console.log(`  reference root: ${REFERENCE_ROOT}`);
    console.log(`  output root: ${OUTPUT_ROOT}`);
    console.log('  POST /generate  { prompt, number, aspect_ratio, reference_file }');
    console.log('  GET  /health');
    console.log('  Auth: Bearer token required (IMAGEGEN_API_TOKEN).');
  });
}

// Only bind a socket when run directly as the entry point, not when imported.
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main();
}
