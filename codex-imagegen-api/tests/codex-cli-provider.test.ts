import { test, expect } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';

import { createCodexCliProvider, codexCliProviderInternals } from '../src/providers/codexCli.js';
import type { CommandResult } from '../src/providers/provider.js';
import { makeTempDir, PNG_BASE64 } from './helpers.js';

test('extractSessionId parses Codex CLI stdout', () => {
  const id = codexCliProviderInternals.extractSessionId('session id: 019db407-7ba4-7643-8f14-47011c0e1dc1');
  expect(id).toBe('019db407-7ba4-7643-8f14-47011c0e1dc1');
});

test('codex-cli provider copies generated image to outputPath', async () => {
  const dir = await makeTempDir();
  const generatedImagesDir = path.join(dir, 'generated_images');
  const sessionId = '019db407-7ba4-7643-8f14-47011c0e1dc1';
  const sourceDir = path.join(generatedImagesDir, sessionId);
  const sourcePath = path.join(sourceDir, 'ig_test.png');
  const outputPath = path.join(dir, 'copied.png');
  await fs.mkdir(sourceDir, { recursive: true });
  await fs.writeFile(sourcePath, Buffer.from(PNG_BASE64, 'base64'));

  const calls: Array<[string, string[]]> = [];
  const execImpl = async (_file: string, args: string[]): Promise<CommandResult> => {
    calls.push([_file, args]);
    if (args[0] === '--version') return { stdout: 'codex-cli 0.122.0\n', stderr: '', code: 0 };
    if (args[0] === 'login') return { stdout: 'Logged in using ChatGPT\n', stderr: '', code: 0 };
    return { stdout: `OpenAI Codex\nsession id: ${sessionId}\n`, stderr: '', code: 0 };
  };

  const provider = createCodexCliProvider({ generatedImagesDir });
  const result = await provider.generateImage({ prompt: 'red square', outputPath, execImpl });

  expect(result.provider).toBe('codex-cli');
  expect(result.sessionId).toBe(sessionId);
  expect(result.response.generatedSourcePath).toBe(sourcePath);
  const bytes = await fs.readFile(outputPath);
  expect(bytes.length > 10).toBe(true);
  expect(calls.length).toBe(3);
});

test('codex-cli provider throws when images are provided', async () => {
  const dir = await makeTempDir();
  const provider = createCodexCliProvider({ generatedImagesDir: path.join(dir, 'g') });
  await expect(
    provider.generateImage({
      prompt: 'red square',
      outputPath: path.join(dir, 'out.png'),
      images: ['data:image/png;base64,abc'],
      execImpl: async (): Promise<CommandResult> => ({ stdout: '', stderr: '', code: 0 })
    })
  ).rejects.toThrow(/does not support image input/);
});

test('codex-cli provider throws when size is requested', async () => {
  const dir = await makeTempDir();
  const provider = createCodexCliProvider({ generatedImagesDir: path.join(dir, 'g') });
  await expect(
    provider.generateImage({
      prompt: 'red square',
      outputPath: path.join(dir, 'out.png'),
      size: '1536x1024',
      execImpl: async (): Promise<CommandResult> => ({ stdout: '', stderr: '', code: 0 })
    })
  ).rejects.toThrow(/does not support output size/);
});

test('codex-cli provider throws when more than one image is requested', async () => {
  const dir = await makeTempDir();
  const provider = createCodexCliProvider({ generatedImagesDir: path.join(dir, 'g') });
  await expect(
    provider.generateImage({
      prompt: 'red square',
      number: 2,
      outputPath: path.join(dir, 'out.png'),
      execImpl: async (): Promise<CommandResult> => ({ stdout: '', stderr: '', code: 0 })
    })
  ).rejects.toThrow(/does not support multiple images/);
});

test('codex-cli provider throws when not logged in', async () => {
  const dir = await makeTempDir();
  const provider = createCodexCliProvider({ generatedImagesDir: path.join(dir, 'g') });
  const execImpl = async (_f: string, args: string[]): Promise<CommandResult> => {
    if (args[0] === '--version') return { stdout: 'codex-cli 0.122.0\n', stderr: '', code: 0 };
    if (args[0] === 'login') return { stdout: 'Not logged in\n', stderr: '', code: 0 };
    return { stdout: '', stderr: '', code: 0 };
  };
  await expect(
    provider.generateImage({ prompt: 'red square', outputPath: path.join(dir, 'out.png'), execImpl })
  ).rejects.toThrow(/not logged in/);
});

test('codex-cli provider throws when no PNG is found', async () => {
  const dir = await makeTempDir();
  const generatedImagesDir = path.join(dir, 'generated_images');
  await fs.mkdir(generatedImagesDir, { recursive: true });
  const provider = createCodexCliProvider({ generatedImagesDir });
  const execImpl = async (_f: string, args: string[]): Promise<CommandResult> => {
    if (args[0] === '--version') return { stdout: 'codex-cli 0.122.0\n', stderr: '', code: 0 };
    if (args[0] === 'login') return { stdout: 'Logged in using ChatGPT\n', stderr: '', code: 0 };
    return { stdout: 'session id: 019db407-7ba4-7643-8f14-47011c0e1dc1\n', stderr: '', code: 0 };
  };
  await expect(
    provider.generateImage({ prompt: 'red square', outputPath: path.join(dir, 'out.png'), execImpl })
  ).rejects.toThrow(/no generated PNG/);
});

async function pathMissing(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return false;
  } catch {
    return true;
  }
}

test("codex-cli provider does not copy another run's image when its own session dir is empty", async () => {
  // Concurrency: this run's session dir has no image yet, but a different
  // concurrent run already wrote a newer PNG. We must NOT copy the other
  // run's image; we fail instead of guessing across sessions.
  const dir = await makeTempDir();
  const generatedImagesDir = path.join(dir, 'generated_images');
  const mySession = '019db407-7ba4-7643-8f14-47011c0e1dc1';
  const otherSession = '029db407-7ba4-7643-8f14-47011c0e1dc2';
  await fs.mkdir(path.join(generatedImagesDir, mySession), { recursive: true });
  const otherDir = path.join(generatedImagesDir, otherSession);
  await fs.mkdir(otherDir, { recursive: true });
  await fs.writeFile(path.join(otherDir, 'other.png'), Buffer.from(PNG_BASE64, 'base64'));

  const outputPath = path.join(dir, 'out.png');
  const provider = createCodexCliProvider({ generatedImagesDir });
  const execImpl = async (_f: string, args: string[]): Promise<CommandResult> => {
    if (args[0] === '--version') return { stdout: 'codex-cli 0.122.0\n', stderr: '', code: 0 };
    if (args[0] === 'login') return { stdout: 'Logged in using ChatGPT\n', stderr: '', code: 0 };
    return { stdout: `session id: ${mySession}\n`, stderr: '', code: 0 };
  };
  await expect(
    provider.generateImage({ prompt: 'red square', outputPath, execImpl })
  ).rejects.toThrow(/no generated PNG/);
  expect(await pathMissing(outputPath)).toBe(true);
});

test('codex-cli provider refuses to guess when no session id is reported', async () => {
  // Without a session id, an image cannot be safely attributed to this run.
  const dir = await makeTempDir();
  const generatedImagesDir = path.join(dir, 'generated_images');
  const someSession = path.join(generatedImagesDir, '039db407-7ba4-7643-8f14-47011c0e1dc3');
  await fs.mkdir(someSession, { recursive: true });
  await fs.writeFile(path.join(someSession, 'img.png'), Buffer.from(PNG_BASE64, 'base64'));

  const outputPath = path.join(dir, 'out.png');
  const provider = createCodexCliProvider({ generatedImagesDir });
  const execImpl = async (_f: string, args: string[]): Promise<CommandResult> => {
    if (args[0] === '--version') return { stdout: 'codex-cli 0.122.0\n', stderr: '', code: 0 };
    if (args[0] === 'login') return { stdout: 'Logged in using ChatGPT\n', stderr: '', code: 0 };
    return { stdout: 'OpenAI Codex\n(no session line here)\n', stderr: '', code: 0 };
  };
  await expect(
    provider.generateImage({ prompt: 'red square', outputPath, execImpl })
  ).rejects.toThrow(/did not report a session id/);
  expect(await pathMissing(outputPath)).toBe(true);
});

test('codex-cli provider rejects a non-integer number instead of flooring it', async () => {
  const dir = await makeTempDir();
  const provider = createCodexCliProvider({ generatedImagesDir: path.join(dir, 'g') });
  await expect(
    provider.generateImage({
      prompt: 'red square',
      number: 1.5,
      outputPath: path.join(dir, 'out.png'),
      execImpl: async (): Promise<CommandResult> => ({ stdout: '', stderr: '', code: 0 })
    })
  ).rejects.toThrow(/number must be an integer/);
});
