import { test, expect } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';

import { createHandler, sandboxOutputDir, sandboxReferencePath } from '../src/server.js';
import type { Config } from '../src/config.js';
import { CodedError } from '../src/errors.js';
import { GenerationFailedError } from '../src/generate.js';
import { fakeRequest, fakeResponse, makeTempDir, writeAuthFixture } from './helpers.js';

const TOKEN = 'a'.repeat(32);
const BAD_TOKEN = 'b'.repeat(32);

function makeConfig(referenceRoot: string): Config {
  return {
    provider: 'codex',
    codexHome: referenceRoot,
    baseUrl: 'https://chatgpt.com/backend-api/codex',
    authFile: path.join(referenceRoot, 'auth.json'),
    installationIdFile: path.join(referenceRoot, 'installation_id'),
    generatedImagesDir: path.join(referenceRoot, 'generated_images'),
    originator: 'codex_cli_rs',
    model: 'gpt-5.4',
    defaultOutputDir: referenceRoot
  };
}

test('server rejects request with no auth header', async () => {
  const dir = await makeTempDir();
  const handler = createHandler({ apiToken: TOKEN, config: makeConfig(dir), referenceRoot: dir, generate: async () => ({ images: [], warnings: [] }) });
  const req = fakeRequest({ headers: {}, body: '{"prompt":"x"}' });
  const res = fakeResponse();
  await handler(req, res);
  expect(res.statusCode).toBe(401);
  expect(res.body).toMatch(/Unauthorized/);
});

test('server rejects request with wrong token', async () => {
  const dir = await makeTempDir();
  const handler = createHandler({ apiToken: TOKEN, config: makeConfig(dir), referenceRoot: dir, generate: async () => ({ images: [], warnings: [] }) });
  const req = fakeRequest({ headers: { authorization: `Bearer ${BAD_TOKEN}` }, body: '{"prompt":"x"}' });
  const res = fakeResponse();
  await handler(req, res);
  expect(res.statusCode).toBe(401);
});

test('server accepts request with correct token', async () => {
  const dir = await makeTempDir();
  const outputRoot = path.join(dir, 'outputs');
  let received: Record<string, unknown> | undefined;
  const handler = createHandler({
    apiToken: TOKEN,
    config: makeConfig(dir),
    referenceRoot: dir,
    outputRoot,
    generate: async (args: Record<string, unknown>) => { received = args; return { images: [], warnings: [] }; }
  });
  const req = fakeRequest({ headers: { authorization: `Bearer ${TOKEN}` }, body: '{"prompt":"hello"}' });
  const res = fakeResponse();
  await handler(req, res);
  expect(res.statusCode).toBe(200);
  expect(received?.prompt).toBe('hello');
  expect(received?.outputDir).toBe(await fs.realpath(outputRoot));
});

test('server rejects prompt missing', async () => {
  const dir = await makeTempDir();
  const handler = createHandler({ apiToken: TOKEN, config: makeConfig(dir), referenceRoot: dir, generate: async () => ({ images: [], warnings: [] }) });
  const req = fakeRequest({ headers: { authorization: `Bearer ${TOKEN}` }, body: '{}' });
  const res = fakeResponse();
  await handler(req, res);
  expect(res.statusCode).toBe(400);
});

test('server rejects reference_file that escapes the root', async () => {
  const dir = await makeTempDir();
  const handler = createHandler({ apiToken: TOKEN, config: makeConfig(dir), referenceRoot: dir, generate: async () => ({ images: [], warnings: [] }) });
  const req = fakeRequest({
    headers: { authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ prompt: 'x', reference_file: '../../etc/passwd' })
  });
  const res = fakeResponse();
  await handler(req, res);
  expect(res.statusCode).toBe(400);
  expect(res.body).toMatch(/escapes the allowed root/);
});

test('server accepts string reference_file and sandboxed path', async () => {
  const dir = await makeTempDir();
  const refPath = path.join(dir, 'cat.png');
  await fs.writeFile(refPath, Buffer.from('pngdata'));
  let received: Record<string, unknown> | undefined;
  const handler = createHandler({
    apiToken: TOKEN,
    config: makeConfig(dir),
    referenceRoot: dir,
    generate: async (args: Record<string, unknown>) => { received = args; return { images: [], warnings: [] }; }
  });
  const req = fakeRequest({
    headers: { authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ prompt: 'x', reference_file: 'cat.png' })
  });
  const res = fakeResponse();
  await handler(req, res);
  expect(res.statusCode).toBe(200);
  expect(received?.reference_file).toEqual([await fs.realpath(refPath)]);
});

test('server rejects output_dir because HTTP output directories are server-owned', async () => {
  const dir = await makeTempDir();
  const handler = createHandler({ apiToken: TOKEN, config: makeConfig(dir), referenceRoot: dir, generate: async () => ({ images: [], warnings: [] }) });
  const req = fakeRequest({
    headers: { authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ prompt: 'x', output_dir: 'custom' })
  });
  const res = fakeResponse();
  await handler(req, res);
  expect(res.statusCode).toBe(400);
  expect(res.body).toMatch(/output_dir is not supported/);
});

test('server rejects output_prefix because filenames are server-owned', async () => {
  const dir = await makeTempDir();
  const handler = createHandler({ apiToken: TOKEN, config: makeConfig(dir), referenceRoot: dir, generate: async () => ({ images: [], warnings: [] }) });
  const req = fakeRequest({
    headers: { authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ prompt: 'x', output_prefix: 'custom' })
  });
  const res = fakeResponse();
  await handler(req, res);
  expect(res.statusCode).toBe(400);
  expect(res.body).toMatch(/output_prefix is not supported/);
});

test('server rejects body over maxBodyBytes', async () => {
  const dir = await makeTempDir();
  const handler = createHandler({
    apiToken: TOKEN,
    config: makeConfig(dir),
    referenceRoot: dir,
    maxBodyBytes: 16,
    generate: async () => ({ images: [], warnings: [] })
  });
  const req = fakeRequest({
    headers: { authorization: `Bearer ${TOKEN}` },
    body: '{"prompt":"this body is way longer than sixteen bytes"}'
  });
  const res = fakeResponse();
  await handler(req, res);
  expect(res.statusCode).toBe(413);
});

test('sandboxReferencePath rejects symlink', async () => {
  const dir = await makeTempDir();
  const target = path.join(dir, 'real.png');
  const link = path.join(dir, 'link.png');
  await fs.writeFile(target, Buffer.from('x'));
  await fs.symlink(target, link);
  await expect(sandboxReferencePath('link.png', dir)).rejects.toThrow(/must not contain symlinks/);
});

test('sandboxReferencePath rejects symlinked parent directory', async () => {
  const dir = await makeTempDir();
  const root = path.join(dir, 'root');
  const outside = path.join(dir, 'outside');
  await fs.mkdir(root);
  await fs.mkdir(outside);
  await fs.writeFile(path.join(outside, 'secret.png'), Buffer.from('x'));
  await fs.symlink(outside, path.join(root, 'linked'));

  await expect(
    sandboxReferencePath('linked/secret.png', root)
  ).rejects.toThrow(/must not contain symlinks/);
});

test('sandboxReferencePath rejects path outside root', async () => {
  const dir = await makeTempDir();
  await expect(sandboxReferencePath('../escape.png', dir)).rejects.toThrow(/escapes the allowed root/);
  await expect(sandboxReferencePath('/etc/passwd', dir)).rejects.toThrow(/escapes the allowed root/);
});

test('sandboxOutputDir rejects symlinked parent directory', async () => {
  const dir = await makeTempDir();
  const root = path.join(dir, 'root');
  const outside = path.join(dir, 'outside');
  await fs.mkdir(root);
  await fs.mkdir(outside);
  await fs.symlink(outside, path.join(root, 'linked'));

  await expect(
    sandboxOutputDir('linked/out', root)
  ).rejects.toThrow(/must not contain symlinks/);
});

test('server rejects invalid number before generate is called', async () => {
  const dir = await makeTempDir();
  let called = false;
  const handler = createHandler({
    apiToken: TOKEN,
    config: makeConfig(dir),
    referenceRoot: dir,
    generate: async () => { called = true; return { images: [], warnings: [] }; }
  });
  const req = fakeRequest({
    headers: { authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ prompt: 'x', number: 0 })
  });
  const res = fakeResponse();
  await handler(req, res);
  expect(res.statusCode).toBe(400);
  expect(called).toBe(false);
  expect(res.body).toMatch(/number must be a positive integer/);
});

test('server rejects number above max before generate is called', async () => {
  const dir = await makeTempDir();
  let called = false;
  const handler = createHandler({
    apiToken: TOKEN,
    config: makeConfig(dir),
    referenceRoot: dir,
    generate: async () => { called = true; return { images: [], warnings: [] }; }
  });
  const req = fakeRequest({
    headers: { authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ prompt: 'x', number: 5 })
  });
  const res = fakeResponse();
  await handler(req, res);
  expect(res.statusCode).toBe(400);
  expect(called).toBe(false);
  expect(res.body).toMatch(/number must be between 1 and 4/);
});

test('createHandler rejects short token', () => {
  expect(
    () => createHandler({ apiToken: 'short', config: {} as Config, referenceRoot: '/tmp' })
  ).toThrow(/apiToken must be at least 16 characters/);
});

test('server 401 response carries UNAUTHORIZED code', async () => {
  const dir = await makeTempDir();
  const handler = createHandler({ apiToken: TOKEN, config: makeConfig(dir), referenceRoot: dir, generate: async () => ({ images: [], warnings: [] }) });
  const req = fakeRequest({ headers: {}, body: '{"prompt":"x"}' });
  const res = fakeResponse();
  await handler(req, res);
  expect(res.statusCode).toBe(401);
  const body = JSON.parse(res.body);
  expect(body.code).toBe('UNAUTHORIZED');
});

test('server 400 on invalid JSON carries INVALID_JSON code', async () => {
  const dir = await makeTempDir();
  const handler = createHandler({ apiToken: TOKEN, config: makeConfig(dir), referenceRoot: dir, generate: async () => ({ images: [], warnings: [] }) });
  const req = fakeRequest({ headers: { authorization: `Bearer ${TOKEN}` }, body: 'not-json' });
  const res = fakeResponse();
  await handler(req, res);
  expect(res.statusCode).toBe(400);
  const body = JSON.parse(res.body);
  expect(body.code).toBe('INVALID_JSON');
});

test('server 413 response carries BODY_TOO_LARGE code', async () => {
  const dir = await makeTempDir();
  const handler = createHandler({
    apiToken: TOKEN, config: makeConfig(dir), referenceRoot: dir, maxBodyBytes: 16, generate: async () => ({ images: [], warnings: [] })
  });
  const req = fakeRequest({
    headers: { authorization: `Bearer ${TOKEN}` },
    body: '{"prompt":"this body is way longer than sixteen bytes"}'
  });
  const res = fakeResponse();
  await handler(req, res);
  expect(res.statusCode).toBe(413);
  const body = JSON.parse(res.body);
  expect(body.code).toBe('BODY_TOO_LARGE');
});

test('server 404 response carries NOT_FOUND code', async () => {
  const dir = await makeTempDir();
  const handler = createHandler({ apiToken: TOKEN, config: makeConfig(dir), referenceRoot: dir, generate: async () => ({ images: [], warnings: [] }) });
  const req = fakeRequest({ method: 'GET', url: '/unknown', headers: { authorization: `Bearer ${TOKEN}` }, body: '' });
  const res = fakeResponse();
  await handler(req, res);
  expect(res.statusCode).toBe(404);
  const body = JSON.parse(res.body);
  expect(body.code).toBe('NOT_FOUND');
});

test('server generate failure surfaces AUTH_EXPIRED code with 401 status', async () => {
  const dir = await makeTempDir();
  const failGenerate = async () => { throw new CodedError('auth expired', 'AUTH_EXPIRED'); };
  const handler = createHandler({ apiToken: TOKEN, config: makeConfig(dir), referenceRoot: dir, generate: failGenerate });
  const req = fakeRequest({ headers: { authorization: `Bearer ${TOKEN}` }, body: '{"prompt":"x"}' });
  const res = fakeResponse();
  await handler(req, res);
  expect(res.statusCode).toBe(401);
  const body = JSON.parse(res.body);
  expect(body.code).toBe('AUTH_EXPIRED');
});

test('server generate failure surfaces RATE_LIMITED code with 429 status', async () => {
  const dir = await makeTempDir();
  const failGenerate = async () => { throw new CodedError('rate limited', 'RATE_LIMITED'); };
  const handler = createHandler({ apiToken: TOKEN, config: makeConfig(dir), referenceRoot: dir, generate: failGenerate });
  const req = fakeRequest({ headers: { authorization: `Bearer ${TOKEN}` }, body: '{"prompt":"x"}' });
  const res = fakeResponse();
  await handler(req, res);
  expect(res.statusCode).toBe(429);
  const body = JSON.parse(res.body);
  expect(body.code).toBe('RATE_LIMITED');
});

test('server generate failure with no code defaults to GENERATE_FAILED', async () => {
  const dir = await makeTempDir();
  const failGenerate = async () => { throw new Error('boom'); };
  const handler = createHandler({ apiToken: TOKEN, config: makeConfig(dir), referenceRoot: dir, generate: failGenerate });
  const req = fakeRequest({ headers: { authorization: `Bearer ${TOKEN}` }, body: '{"prompt":"x"}' });
  const res = fakeResponse();
  await handler(req, res);
  expect(res.statusCode).toBe(500);
  const body = JSON.parse(res.body);
  expect(body.code).toBe('GENERATE_FAILED');
});

test('server generate failure includes partial path metadata only', async () => {
  const dir = await makeTempDir();
  const partial = {
    warnings: [],
    outputRoot: path.join(dir, 'outputs'),
    outputDir: path.join(dir, 'outputs', '2026-06-28', 'a-red-sports-car'),
    relativeOutputDir: '2026-06-28/a-red-sports-car',
    slug: 'a-red-sports-car',
    images: [{
      index: 0,
      savedPath: path.join(dir, 'outputs', '2026-06-28', 'a-red-sports-car', 'image-1.png'),
      relativePath: '2026-06-28/a-red-sports-car/image-1.png'
    }]
  };
  const failGenerate = async () => {
    throw new GenerationFailedError('backend failed', 'BACKEND_ERROR', partial);
  };
  const handler = createHandler({ apiToken: TOKEN, config: makeConfig(dir), referenceRoot: dir, generate: failGenerate });
  const req = fakeRequest({ headers: { authorization: `Bearer ${TOKEN}` }, body: '{"prompt":"A red sports car"}' });
  const res = fakeResponse();
  await handler(req, res);

  expect(res.statusCode).toBe(500);
  const body = JSON.parse(res.body);
  expect(body).toMatchObject({
    code: 'BACKEND_ERROR',
    relativeOutputDir: '2026-06-28/a-red-sports-car',
    slug: 'a-red-sports-car',
    images: [expect.objectContaining({ relativePath: '2026-06-28/a-red-sports-car/image-1.png' })]
  });
  expect(res.body).not.toContain('A red sports car');
});

test('/health does not leak auth detail (no authMode, token, or account fields)', async () => {
  const dir = await makeTempDir();
  await writeAuthFixture(dir);
  const handler = createHandler({ apiToken: TOKEN, config: makeConfig(dir), referenceRoot: dir, generate: async () => ({ images: [], warnings: [] }) });
  const req = fakeRequest({ method: 'GET', url: '/health', headers: { authorization: `Bearer ${TOKEN}` }, body: '' });
  const res = fakeResponse();
  await handler(req, res);
  expect(res.statusCode).toBe(200);
  const body = JSON.parse(res.body);
  expect(body.ok).toBe(true);
  expect(body.referenceRoot).toBe(dir);
  expect(body.outputRoot).toBe(await fs.realpath(dir));
  expect('auth' in body).toBe(false);
  expect('authMode' in body).toBe(false);
  expect('hasAccessToken' in body).toBe(false);
  expect('hasAccountId' in body).toBe(false);
  expect('hasInstallationId' in body).toBe(false);
});
