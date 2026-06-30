// codex-cli headless provider: drives `codex exec` and copies the generated
// PNG from ~/.codex/generated_images/<session-id>/ into the requested output.
//
// This is the "headless CLI mode" fallback. It does NOT support reference
// images or output size selection; it fails fast instead of silently dropping
// those options.
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { CodedError } from '../errors.js';
import { normalizeNumber } from '../options.js';
import { allocateOutputPaths } from '../output.js';
import type { Provider, ProviderGenerateArgs, CodexCliResult, CommandResult } from './provider.js';
import { CODEX_CLI_PROVIDER } from './types.js';

const SESSION_ID_PATTERN = /session id:\s*([0-9a-f-]{36})/i;
const PNG_PATTERN = /\.png$/i;
const BWRAP_PATTERN = /bwrap:|Failed RTM_NEWADDR/i;

function quoteForPrompt(text: string): string {
  return text.replaceAll('"', '\\"');
}

function buildWrappedPrompt(prompt: string): string {
  return [
    `Generate an image of "${quoteForPrompt(prompt)}".`,
    'If possible, save the resulting image to a file or leave a URL.',
    'If that is not possible, explain exactly why.',
    "In your final answer, respond in the user's language and include success or failure status plus the output path or URL if known."
  ].join(' ');
}

export function extractSessionId(output: string): string | null {
  return output.match(SESSION_ID_PATTERN)?.[1] ?? null;
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

interface PngCandidate {
  path: string;
  mtimeMs: number;
}

async function findNewestPng(directory: string): Promise<PngCandidate | null> {
  if (!(await pathExists(directory))) return null;
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const candidates: PngCandidate[] = [];
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      const nested = await findNewestPng(entryPath);
      if (nested) candidates.push(nested);
      continue;
    }
    if (entry.isFile() && PNG_PATTERN.test(entry.name)) {
      const stat = await fs.stat(entryPath);
      candidates.push({ path: entryPath, mtimeMs: stat.mtimeMs });
    }
  }
  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return candidates[0] ?? null;
}

// Concurrency safety: only ever attribute an image from THIS run's session
// directory. A global newest-by-mtime scan across all sessions could copy a
// different concurrent run's image, so we never guess across sessions.
async function findGeneratedImage({
  generatedImagesDir,
  sessionId
}: {
  generatedImagesDir: string;
  sessionId: string;
}): Promise<PngCandidate | null> {
  return findNewestPng(path.join(generatedImagesDir, sessionId));
}

async function ensureParentDir(filePath: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

export function runCommand(file: string, args: string[], options: object = {}): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, { stdio: ['pipe', 'pipe', 'pipe'], ...options });
    let stdout = '';
    let stderr = '';
    child.stdout?.setEncoding('utf8');
    child.stderr?.setEncoding('utf8');
    child.stdout?.on('data', (chunk: string) => { stdout += chunk; });
    child.stderr?.on('data', (chunk: string) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code: number | null) => {
      if (code === 0) {
        resolve({ stdout, stderr, code: 0 });
        return;
      }
      reject(new CodedError(
        `Command failed: ${file} ${args.join(' ')}`,
        'COMMAND_FAILED',
        { cause: { stdout, stderr, code: code ?? 1 } }
      ));
    });
    child.stdin?.end();
  });
}

async function runCodexPreflight(execImpl: (file: string, args: string[], options?: object) => Promise<CommandResult>): Promise<{
  version: string;
  loginStatus: string;
}> {
  const version = await execImpl('codex', ['--version']);
  const login = await execImpl('codex', ['login', 'status']);
  const versionText = `${version.stdout || ''}${version.stderr || ''}`.trim();
  const loginText = `${login.stdout || ''}${login.stderr || ''}`.trim();
  return { version: versionText, loginStatus: loginText };
}

interface CodexCliProviderConfig {
  generatedImagesDir: string;
}

/**
 * Create the codex-cli headless provider.
 */
export function createCodexCliProvider(config: CodexCliProviderConfig): Provider {
  return {
    async generateImage({
      prompt,
      model,
      outputDir,
      outputPath,
      debug = false,
      debugDir,
      execImpl = runCommand,
      images,
      size,
      outputPrefix,
      number = 1
    }: ProviderGenerateArgs): Promise<CodexCliResult> {
      if (outputPrefix) {
        throw new Error('outputPrefix is not supported; filenames are generated by the API.');
      }
      if (normalizeNumber(number) > 1) {
        throw new CodedError('The codex-cli provider does not support multiple images.', 'UNSUPPORTED_NUMBER');
      }
      if (images && images.length > 0) {
        throw new CodedError('The codex-cli provider does not support image input.', 'UNSUPPORTED_IMAGES');
      }
      if (size && size !== 'auto') {
        throw new CodedError('The codex-cli provider does not support output size selection.', 'UNSUPPORTED_SIZE');
      }
      if (!prompt || !prompt.trim()) throw new Error('prompt is required.');
      if (!outputDir && !outputPath) throw new Error('outputDir is required for the codex-cli provider.');
      const outputPlan = outputDir
        ? await allocateOutputPaths({ outputRoot: outputDir, prompt, count: 1 })
        : null;
      const targetPath = outputPlan?.images[0]?.path ?? outputPath;
      if (!targetPath) throw new Error('output path is required for the codex-cli provider.');

      const preflight = await runCodexPreflight(execImpl);
      if (!/Logged in using ChatGPT/i.test(preflight.loginStatus)) {
        throw new CodedError(
          `Codex CLI is not logged in with ChatGPT: ${preflight.loginStatus}`,
          'CODEX_CLI_NOT_LOGGED_IN'
        );
      }

      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'imagegen-cli-'));
      const lastMessagePath = path.join(tempDir, 'last.txt');
      const wrappedPrompt = buildWrappedPrompt(prompt);
      const args = [
        'exec',
        '--skip-git-repo-check',
        '--ephemeral',
        '--sandbox', 'workspace-write',
        ...(model ? ['--model', model] : []),
        '-C', tempDir,
        '--output-last-message', lastMessagePath,
        wrappedPrompt
      ];

      const run = await execImpl('codex', args);
      const combinedOutput = `${run.stdout || ''}\n${run.stderr || ''}`;
      const sessionId = extractSessionId(combinedOutput);

      const warnings: string[] = [];
      if (BWRAP_PATTERN.test(combinedOutput)) {
        warnings.push('Codex CLI reported a sandbox/bwrap inspection warning; this does not always mean image generation failed.');
      }

      // Without a session id we cannot safely attribute a generated PNG to this
      // run; refuse rather than guess (which could copy a concurrent run's image).
      if (!sessionId) {
        throw new CodedError(
          'Codex CLI run completed but did not report a session id, so the generated image cannot be safely attributed to this run.',
          'CODEX_CLI_NO_SESSION_ID'
        );
      }

      const generated = await findGeneratedImage({
        generatedImagesDir: config.generatedImagesDir,
        sessionId
      });

      if (!generated) {
        throw new CodedError(
          'Codex CLI run completed, but no generated PNG was found under ~/.codex/generated_images.',
          'CODEX_CLI_IMAGE_NOT_FOUND',
          { cause: { sessionId } }
        );
      }

      await ensureParentDir(targetPath);
      await fs.copyFile(generated.path, targetPath);

      const lastMessage = await fs.readFile(lastMessagePath, 'utf8').catch(() => '');
      if (debug && debugDir) {
        await fs.mkdir(debugDir, { recursive: true });
        const payload = {
          provider: CODEX_CLI_PROVIDER,
          preflight,
          sessionId,
          command: {
            binary: 'codex',
            args: args.map((value, index) => (index === args.length - 1 ? '[PROMPT_REDACTED]' : value))
          },
          tempDir,
          lastMessage,
          generatedImage: { sourcePath: generated.path, copiedTo: targetPath },
          warnings
        };
        await fs.writeFile(path.join(debugDir, 'codex-cli-run.json'), JSON.stringify(payload, null, 2));
      }

      return {
        provider: CODEX_CLI_PROVIDER,
        mode: 'live',
        warnings,
        sessionId,
        savedPath: targetPath,
        revisedPrompt: null,
        images: [{
          index: 0,
          savedPath: targetPath,
          relativePath: outputPlan?.images[0]?.relativePath,
          sessionId
        }],
        outputRoot: outputPlan?.outputRoot,
        outputDir: outputPlan?.outputDir,
        relativeOutputDir: outputPlan?.relativeOutputDir,
        slug: outputPlan?.slug,
        request: { transport: 'codex exec', preflight },
        response: { generatedSourcePath: generated.path, lastMessage }
      };
    }
  };
}

export const codexCliProviderInternals = {
  buildWrappedPrompt,
  extractSessionId,
  findGeneratedImage
};
