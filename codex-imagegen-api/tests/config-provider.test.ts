import { test, expect } from 'vitest';
import { resolveConfig } from '../src/config.js';
import { CODEX_PROVIDER, CODEX_CLI_PROVIDER, AUTO_PROVIDER, SUPPORTED_PROVIDERS } from '../src/providers/types.js';

test('resolveConfig defaults to codex provider', () => {
  const c = resolveConfig();
  expect(c.provider).toBe(CODEX_PROVIDER);
});

test('resolveConfig accepts all supported providers', () => {
  for (const p of SUPPORTED_PROVIDERS) {
    const c = resolveConfig({ provider: p });
    expect(c.provider).toBe(p);
  }
});

test('resolveConfig rejects unsupported provider', () => {
  expect(
    () => resolveConfig({ provider: 'bogus' })
  ).toThrow(/Unsupported provider: bogus/);
});

test('resolveConfig includes generatedImagesDir', () => {
  const c = resolveConfig();
  expect(c.generatedImagesDir.endsWith('generated_images')).toBe(true);
});
