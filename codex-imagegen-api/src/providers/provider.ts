// Shared provider interface implemented by codex, codex-cli, and auto.
import type { Config } from '../config.js';
import type { GeneratedImage } from '../generate.js';

export interface ProviderGenerateArgs {
  prompt: string;
  model?: string;
  outputDir?: string;
  outputPath?: string;
  dryRun?: boolean;
  debug?: boolean;
  debugDir?: string;
  execImpl?: (file: string, args: string[], options?: object) => Promise<CommandResult>;
  images?: string[];
  size?: string;
  outputPrefix?: string;
  number?: number | string;
}

export interface CommandResult {
  stdout: string;
  stderr: string;
  code: number;
}

// Discriminated union: the `provider` field narrows the rest of the shape.
// This replaces the previous `request?: unknown` / `response?: unknown`
// escape hatches with explicit, typed per-provider debug payloads.

export interface CodexResult {
  provider: 'codex';
  mode: 'live' | 'dry-run';
  warnings: string[];
  images: GeneratedImage[];
  outputRoot?: string;
  outputDir?: string;
  relativeOutputDir?: string;
  slug?: string;
  responseId?: string | null;
  sessionId?: string;
}

export interface CodexCliResult {
  provider: 'codex-cli';
  mode: 'live' | 'dry-run';
  warnings: string[];
  savedPath?: string;
  sessionId?: string | null;
  revisedPrompt?: string | null;
  images?: GeneratedImage[];
  outputRoot?: string;
  outputDir?: string;
  relativeOutputDir?: string;
  slug?: string;
  request: {
    transport: 'codex exec';
    preflight: { version: string; loginStatus: string };
  };
  response: {
    generatedSourcePath: string;
    lastMessage: string;
  };
}

export type ProviderResult = CodexResult | CodexCliResult;

export interface Provider {
  generateImage(args: ProviderGenerateArgs): Promise<ProviderResult>;
}

export type ProviderFactory = (config: Config) => Provider;
