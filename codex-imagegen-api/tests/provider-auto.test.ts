import { test, expect } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';

import { createProvider } from '../src/providers/createProvider.js';
import { CODEX_PROVIDER, CODEX_CLI_PROVIDER } from '../src/providers/types.js';
import type { Config } from '../src/config.js';
import type { CommandResult } from '../src/providers/provider.js';
import { makeTempDir, PNG_BASE64, writeAuthFixture } from './helpers.js';

// Build a config object for the auto provider. The codex path is made to
// fail by pointing auth at a missing file.
function makeAutoConfig(dir: string, generatedImagesDir: string, authFile?: string, installationIdFile?: string): Config {
  return {
    provider: 'auto',
    codexHome: dir,
    generatedImagesDir,
    baseUrl: 'https://chatgpt.com/backend-api/codex',
    authFile: authFile ?? path.join(dir, 'missing-auth.json'),
    installationIdFile: installationIdFile ?? path.join(dir, 'missing-installation-id'),
    originator: 'codex_cli_rs',
    model: 'gpt-5.4',
    defaultOutputDir: dir
  };
}

test('auto provider falls back to codex-cli when codex fails', async () => {
  const dir = await makeTempDir();
  const generatedImagesDir = path.join(dir, 'generated_images');
  const sessionId = '019db407-7ba4-7643-8f14-47011c0e1dc1';
  const sourceDir = path.join(generatedImagesDir, sessionId);
  const sourcePath = path.join(sourceDir, 'ig.png');
  const outputPath = path.join(dir, 'out.png');
  await fs.mkdir(sourceDir, { recursive: true });
  await fs.writeFile(sourcePath, Buffer.from(PNG_BASE64, 'base64'));

  const config = makeAutoConfig(dir, generatedImagesDir);
  const provider = createProvider(config);
  const execImpl = async (_f: string, args: string[]): Promise<CommandResult> => {
    if (args[0] === '--version') return { stdout: 'codex-cli 0.122.0\n', stderr: '', code: 0 };
    if (args[0] === 'login') return { stdout: 'Logged in using ChatGPT\n', stderr: '', code: 0 };
    return { stdout: `session id: ${sessionId}\n`, stderr: '', code: 0 };
  };
  const result = await provider.generateImage({ prompt: 'red square', outputPath, execImpl });
  expect(result.provider).toBe(CODEX_CLI_PROVIDER);
  expect(result.warnings.some((w) => /auto fallback/i.test(w))).toBe(true);
});

test('auto provider refuses fallback when size is set', async () => {
  const dir = await makeTempDir();
  const config = makeAutoConfig(dir, path.join(dir, 'g'));
  const provider = createProvider(config);
  await expect(
    provider.generateImage({
      prompt: 'red square',
      outputPath: path.join(dir, 'out.png'),
      size: '1536x1024',
      execImpl: async (): Promise<CommandResult> => { throw new Error('should not reach cli'); }
    })
  ).rejects.toThrow(/cannot fall back to codex-cli when --size is set/);
});

test('auto provider refuses fallback when reference images are set', async () => {
  const dir = await makeTempDir();
  const config = makeAutoConfig(dir, path.join(dir, 'g'));
  const provider = createProvider(config);
  await expect(
    provider.generateImage({
      prompt: 'red square',
      outputPath: path.join(dir, 'out.png'),
      images: ['data:image/png;base64,abc'],
      execImpl: async (): Promise<CommandResult> => { throw new Error('should not reach cli'); }
    })
  ).rejects.toThrow(/cannot fall back to codex-cli when reference images are provided/);
});

test('auto provider refuses fallback when multiple images are requested', async () => {
  const dir = await makeTempDir();
  const config = makeAutoConfig(dir, path.join(dir, 'g'));
  const provider = createProvider(config);
  await expect(
    provider.generateImage({
      prompt: 'red square',
      number: 2,
      outputPath: path.join(dir, 'out.png'),
      execImpl: async (): Promise<CommandResult> => { throw new Error('should not reach cli'); }
    })
  ).rejects.toThrow(/cannot fall back to codex-cli when multiple images are requested/);
});

test('auto provider preserves multi-image requests when codex succeeds', async () => {
  const dir = await makeTempDir();
  const auth = await writeAuthFixture(dir);
  const outputDir = path.join(dir, 'out-root');
  const originalFetch = globalThis.fetch;
  const encoder = new TextEncoder();
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(
          'event: response.created\n' +
          `data: {"type":"response.created","response":{"id":"resp_${calls}"}}\n\n` +
          'event: response.output_item.done\n' +
          `data: {"type":"response.output_item.done","item":{"type":"image_generation_call","id":"call_${calls}","result":"${PNG_BASE64}","revised_prompt":"red square"}}\n\n`
        ));
        controller.close();
      }
    }), { status: 200 });
  };

  try {
    const config = makeAutoConfig(dir, path.join(dir, 'generated_images'), auth.authPath, auth.installationIdPath);
    const provider = createProvider(config);
    const result = await provider.generateImage({
      prompt: 'red square',
      number: 2,
      outputDir
    });

    expect(result.provider).toBe(CODEX_PROVIDER);
    expect(result.images?.length).toBe(2);
    expect(calls).toBe(2);
    expect(result.relativeOutputDir).toMatch(/^\d{4}-\d{2}-\d{2}\/red-square$/);
    expect((await fs.stat(path.join(result.outputDir ?? '', 'image-1.png'))).isFile()).toBe(true);
    expect((await fs.stat(path.join(result.outputDir ?? '', 'image-2.png'))).isFile()).toBe(true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
