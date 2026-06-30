import { test, expect } from 'vitest';
import { generateImage } from '../src/generate.js';
import { normalizeReferenceFile } from '../src/options.js';
import { resolveConfig } from '../src/config.js';

// Tests for validation that runs before config is used for network calls.
// Pass a real config so the type contract is honest; the validation errors
// below fire before any auth or network access occurs.
const config = resolveConfig();

test('generateImage rejects non-positive number', async () => {
  await expect(
    generateImage({ prompt: 'x', number: 0, config })
  ).rejects.toThrow(/number must be a positive integer/);
  await expect(
    generateImage({ prompt: 'x', number: NaN, config })
  ).rejects.toThrow(/number must be a positive integer/);
});

test('generateImage rejects non-finite number', async () => {
  await expect(
    generateImage({ prompt: 'x', number: 'abc', config })
  ).rejects.toThrow(/number must be a positive integer/);
});

test('generateImage rejects number above max instead of silently clamping', async () => {
  await expect(
    generateImage({ prompt: 'x', number: 5, config })
  ).rejects.toThrow(/number must be between 1 and 4/);
});

test('generateImage rejects non-integer number instead of flooring', async () => {
  await expect(
    generateImage({ prompt: 'x', number: 1.5, config })
  ).rejects.toThrow(/number must be an integer/);
});

test('generateImage rejects string reference_file that is not a path type', async () => {
  await expect(
    generateImage({ prompt: 'x', number: 1, reference_file: 42 as unknown as string, config })
  ).rejects.toThrow(/reference_file must be a string or an array of strings/);
});

test('normalizeReferenceFile rejects invalid array entries', () => {
  expect(
    () => normalizeReferenceFile([42 as unknown as string])
  ).toThrow(/reference_file entries must be non-empty strings/);
  expect(
    () => normalizeReferenceFile([''])
  ).toThrow(/reference_file entries must be non-empty strings/);
});

test('generateImage accepts single string reference_file (fails later at file read, not at normalization)', async () => {
  // A single string is normalized to [string]; then readImageAsDataUrl throws
  // because the file does not exist.
  await expect(
    generateImage({ prompt: 'x', number: 1, reference_file: '/nonexistent/does-not-exist.png', config })
  ).rejects.toThrow(/reference_file not found/);
});

test('generateImage rejects outputPrefix because filenames are server-owned', async () => {
  await expect(
    generateImage({ prompt: 'x', outputPrefix: 'custom', config })
  ).rejects.toThrow(/outputPrefix is not supported/);
});
