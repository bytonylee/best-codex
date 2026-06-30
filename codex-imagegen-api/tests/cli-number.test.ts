import { test, expect } from 'vitest';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.join(here, '..', 'src', 'cli.ts');

// Run the CLI via tsx in a child process. Number validation happens before any
// auth or network access, so these invocations never touch the ChatGPT backend.
function runCli(args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile('npx', ['tsx', CLI, ...args], { cwd: here }, (error, stdout, stderr) => {
      resolve({ code: error?.code ?? 0, stdout, stderr });
    });
  });
}

test('CLI rejects a non-integer --number instead of flooring it', async () => {
  const { code, stderr } = await runCli(['-p', 'x', '-n', '2.5', '--dry-run']);
  expect(code).toBe(1);
  expect(stderr).toMatch(/number must be an integer/);
});

test('CLI rejects --number above the maximum instead of clamping', async () => {
  const { code, stderr } = await runCli(['-p', 'x', '-n', '5', '--dry-run']);
  expect(code).toBe(1);
  expect(stderr).toMatch(/number must be between 1 and 4/);
});

test('CLI rejects a non-numeric --number instead of defaulting', async () => {
  const { code, stderr } = await runCli(['-p', 'x', '-n', '1abc', '--dry-run']);
  expect(code).toBe(1);
  expect(stderr).toMatch(/number must be a positive integer/);
});

test('CLI rejects a zero --number', async () => {
  const { code, stderr } = await runCli(['-p', 'x', '-n', '0', '--dry-run']);
  expect(code).toBe(1);
  expect(stderr).toMatch(/number must be a positive integer/);
});

test('CLI rejects missing --number value before auth', async () => {
  const { code, stderr } = await runCli(['-p', 'x', '--number', '--dry-run']);
  expect(code).toBe(1);
  expect(stderr).toMatch(/--number requires a value/);
});

test('CLI rejects missing --reference_file value before auth', async () => {
  const { code, stderr } = await runCli(['-p', 'x', '-r', '--dry-run']);
  expect(code).toBe(1);
  expect(stderr).toMatch(/-r requires a value/);
});

test('CLI rejects missing --provider value before auth', async () => {
  const { code, stderr } = await runCli(['-p', 'x', '--provider', '--dry-run']);
  expect(code).toBe(1);
  expect(stderr).toMatch(/--provider requires a value/);
});

test('CLI rejects --output-prefix before auth', async () => {
  const { code, stderr } = await runCli(['-p', 'x', '--output-prefix', 'custom', '--dry-run']);
  expect(code).toBe(1);
  expect(stderr).toMatch(/--output-prefix is not supported/);
});
