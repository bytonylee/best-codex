import { test, expect } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';

import {
  allocateOutputPaths,
  imageFilename,
  planOutputPaths,
  slugFromPrompt
} from '../src/output.js';
import { makeTempDir } from './helpers.js';

test('slugFromPrompt uses first 15 words, ASCII-only separators, and 80 character cap', () => {
  expect(slugFromPrompt('A red sports car on a rainy Tokyo street at night with neon signs everywhere')).toBe(
    'a-red-sports-car-on-a-rainy-tokyo-street-at-night-with-neon-signs-everywhere'
  );
  expect(slugFromPrompt('한글 그림')).toBe('image');
  expect(slugFromPrompt('Supercalifragilisticexpialidocious '.repeat(15))).toHaveLength(80);
});

test('imageFilename uses plain image name for one image and one-based suffixes for multiples', () => {
  expect(imageFilename(0, 1)).toBe('image.png');
  expect(imageFilename(0, 3)).toBe('image-1.png');
  expect(imageFilename(2, 3)).toBe('image-3.png');
});

test('planOutputPaths does not create directories and uses POSIX relative paths', async () => {
  const root = await makeTempDir();
  const planned = planOutputPaths({
    outputRoot: root,
    prompt: 'A red sports car on a rainy Tokyo street at night',
    count: 2,
    now: new Date(2026, 5, 28)
  });

  expect(planned.slug).toBe('a-red-sports-car-on-a-rainy-tokyo-street-at-night');
  expect(planned.relativeOutputDir).toBe('2026-06-28/a-red-sports-car-on-a-rainy-tokyo-street-at-night');
  expect(planned.images.map((image) => image.relativePath)).toEqual([
    '2026-06-28/a-red-sports-car-on-a-rainy-tokyo-street-at-night/image-1.png',
    '2026-06-28/a-red-sports-car-on-a-rainy-tokyo-street-at-night/image-2.png'
  ]);
  await expect(fs.stat(path.join(root, '2026-06-28'))).rejects.toThrow();
});

test('allocateOutputPaths creates a unique prompt directory atomically', async () => {
  const root = await makeTempDir();
  const first = await allocateOutputPaths({
    outputRoot: root,
    prompt: 'A red sports car',
    count: 1,
    now: new Date(2026, 5, 28)
  });
  const second = await allocateOutputPaths({
    outputRoot: root,
    prompt: 'A red sports car',
    count: 1,
    now: new Date(2026, 5, 28)
  });

  expect(first.relativeOutputDir).toBe('2026-06-28/a-red-sports-car');
  expect(second.relativeOutputDir).toBe('2026-06-28/a-red-sports-car-2');
  expect((await fs.stat(first.outputDir)).isDirectory()).toBe(true);
  expect((await fs.stat(second.outputDir)).isDirectory()).toBe(true);
});
