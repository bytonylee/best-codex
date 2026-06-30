// Runtime configuration for imagegen-api.
// Reads Codex auth from ~/.codex/auth.json (auth_mode=chatgpt).
import os from 'node:os';
import path from 'node:path';

import { CODEX_PROVIDER, SUPPORTED_PROVIDERS, type ProviderId } from './providers/types.js';

const DEFAULT_CODEX_HOME = path.join(os.homedir(), '.codex');

// aspect_ratio -> gpt-image-2 size string
export const ASPECT_RATIO_TO_SIZE: Readonly<Record<string, string>> = {
  '1:1': '1024x1024',
  '3:2': '1536x1024',
  '2:3': '1024x1536',
  '16:9': '2048x1152',
  '9:16': '1152x2048',
  '4:3': '1536x1024',
  '3:4': '1024x1536',
  'auto': 'auto'
};

export const SUPPORTED_SIZES: ReadonlySet<string> = new Set([
  'auto', '1024x1024', '1536x1024', '1024x1536',
  '2048x2048', '2048x1152', '3840x2160', '2160x3840'
]);

export function resolveAspectRatio(aspectRatio: string | undefined): string {
  if (!aspectRatio || aspectRatio === 'auto') return 'auto';
  const mapped = ASPECT_RATIO_TO_SIZE[aspectRatio];
  if (mapped) return mapped;
  // Allow raw size passthrough (e.g. "1536x1024")
  if (SUPPORTED_SIZES.has(aspectRatio)) return aspectRatio;
  throw new Error(
    `Unsupported aspect_ratio: ${aspectRatio}. ` +
    `Supported: ${Object.keys(ASPECT_RATIO_TO_SIZE).join(', ')} or raw size like 1536x1024.`
  );
}

export interface ConfigOverrides {
  codexHome?: string;
  provider?: string;
  baseUrl?: string;
  authFile?: string;
  installationIdFile?: string;
  generatedImagesDir?: string;
  model?: string;
  originator?: string;
  defaultOutputDir?: string;
}

export interface Config {
  codexHome: string;
  provider: ProviderId;
  baseUrl: string;
  authFile: string;
  installationIdFile: string;
  generatedImagesDir: string;
  model: string;
  originator: string;
  defaultOutputDir: string;
}

export function resolveConfig(overrides: ConfigOverrides = {}): Config {
  const codexHome = overrides.codexHome || process.env.CODEX_HOME || DEFAULT_CODEX_HOME;
  const provider = overrides.provider || process.env.IMAGEGEN_PROVIDER || CODEX_PROVIDER;
  if (!SUPPORTED_PROVIDERS.includes(provider as ProviderId)) {
    throw new Error(`Unsupported provider: ${provider}. Supported: ${SUPPORTED_PROVIDERS.join(', ')}.`);
  }
  return {
    codexHome,
    provider: provider as ProviderId,
    baseUrl: overrides.baseUrl || process.env.IMAGEGEN_BASE_URL || 'https://chatgpt.com/backend-api/codex',
    authFile: overrides.authFile || process.env.IMAGEGEN_AUTH_FILE || path.join(codexHome, 'auth.json'),
    installationIdFile:
      overrides.installationIdFile ||
      process.env.IMAGEGEN_INSTALLATION_ID_FILE ||
      path.join(codexHome, 'installation_id'),
    generatedImagesDir:
      overrides.generatedImagesDir ||
      process.env.IMAGEGEN_GENERATED_IMAGES_DIR ||
      path.join(codexHome, 'generated_images'),
    model: overrides.model || process.env.IMAGEGEN_MODEL || process.env.CODEX_MODEL || 'gpt-5.4',
    originator: overrides.originator || process.env.IMAGEGEN_ORIGINATOR || 'codex_cli_rs',
    defaultOutputDir:
      overrides.defaultOutputDir ||
      process.env['IMAGEGEN_' + 'OUTPUT_ROOT'] ||
      process.env['IMAGEGEN_' + 'OUTPUT_DIR'] ||
      path.join(process.cwd(), 'outputs')
  };
}
