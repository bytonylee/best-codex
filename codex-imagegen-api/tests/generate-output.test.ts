import { test, expect } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';

import { resolveConfig } from '../src/config.js';
import { generateImage, GenerationFailedError } from '../src/generate.js';
import { makeTempDir, PNG_BASE64, writeAuthFixture } from './helpers.js';

async function makeConfig(dir: string) {
  const auth = await writeAuthFixture(dir);
  return resolveConfig({
    codexHome: dir,
    authFile: auth.authPath,
    installationIdFile: auth.installationIdPath,
    defaultOutputDir: path.join(dir, 'outputs')
  });
}

function installFetch(statuses: number[]): () => void {
  const originalFetch = globalThis.fetch;
  const encoder = new TextEncoder();
  let calls = 0;
  globalThis.fetch = async () => {
    const status = statuses[calls] ?? 200;
    calls += 1;
    if (status !== 200) {
      return new Response('backend failed', { status });
    }
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
  return () => { globalThis.fetch = originalFetch; };
}

test('generateImage treats outputDir as an output root', async () => {
  const dir = await makeTempDir();
  const outputRoot = path.join(dir, 'out-root');
  const restoreFetch = installFetch([200]);
  try {
    const result = await generateImage({
      prompt: 'A red sports car',
      outputDir: outputRoot,
      config: await makeConfig(dir)
    });

    expect(result.relativeOutputDir).toMatch(/^\d{4}-\d{2}-\d{2}\/a-red-sports-car$/);
    expect(result.images[0]?.relativePath).toMatch(/\/a-red-sports-car\/image\.png$/);
    expect(result.images[0]?.savedPath).toBe(path.join(result.outputDir ?? '', 'image.png'));
    expect((await fs.stat(result.images[0]?.savedPath ?? '')).isFile()).toBe(true);
  } finally {
    restoreFetch();
  }
});

test('generateImage dry-run returns planned paths without creating directories', async () => {
  const dir = await makeTempDir();
  const outputRoot = path.join(dir, 'out-root');
  const result = await generateImage({
    prompt: 'A red sports car',
    outputDir: outputRoot,
    dryRun: true,
    config: await makeConfig(dir)
  });

  expect(result.images[0]?.plannedPath).toBe(path.join(result.outputDir ?? '', 'image.png'));
  expect(result.images[0]?.savedPath).toBeUndefined();
  await expect(fs.stat(result.outputDir ?? '')).rejects.toThrow();
  expect(result.warnings.join('\n')).toMatch(/did not create or reserve/);
});

test('generateImage preserves saved files and exposes path-only metadata on partial failure', async () => {
  const dir = await makeTempDir();
  const restoreFetch = installFetch([200, 500]);
  try {
    try {
      await generateImage({
        prompt: 'A red sports car',
        number: 2,
        outputDir: path.join(dir, 'out-root'),
        config: await makeConfig(dir)
      });
      expect.unreachable('expected partial failure');
    } catch (e) {
      expect(e).toBeInstanceOf(GenerationFailedError);
      const partial = (e as GenerationFailedError).partialResult;
      expect(partial.slug).toBe('a-red-sports-car');
      expect(partial.images[0]).toMatchObject({
        index: 0,
        relativePath: expect.stringMatching(/\/a-red-sports-car\/image-1\.png$/)
      });
      expect(partial.images[0]?.savedPath).toBeTruthy();
      expect((await fs.stat(partial.images[0]?.savedPath ?? '')).isFile()).toBe(true);
      expect(JSON.stringify(partial)).not.toContain('A red sports car');
    }
  } finally {
    restoreFetch();
  }
});
