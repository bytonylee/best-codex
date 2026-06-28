// Library API entry point.
export { resolveConfig, resolveAspectRatio, ASPECT_RATIO_TO_SIZE, SUPPORTED_SIZES, type Config, type ConfigOverrides } from './config.js';
export { loadSession, validateSession, checkAuth, type Session, type AuthStatus } from './auth.js';
export { CodedError } from './errors.js';
export { buildRequest, type BuiltRequest, type BuildRequestArgs } from './request.js';
export { createSseParser, extractImage, type SseParser, type SseEvent, type SseItem, type ExtractedImage } from './sse.js';
export { generateImage, readImageAsDataUrl, type GenerationResult, type GeneratedImage, type GenerateImageArgs } from './generate.js';
export { normalizeGenerationOptions, normalizeNumber, normalizeReferenceFile, type NormalizedGenerationOptions, type GenerationOptionsInput } from './options.js';
export {
  allocateOutputPaths,
  imageFilename,
  planOutputPaths,
  slugFromPrompt,
  OUTPUT_COLLISION_LIMIT,
  type PlannedOutput,
  type PlannedOutputImage
} from './output.js';
export { createHandler, sandboxOutputDir, sandboxReferencePath, DEFAULT_MAX_BODY_BYTES } from './server.js';
export { createProvider } from './providers/createProvider.js';
export { createCodexProvider } from './providers/codex.js';
export { createCodexCliProvider, codexCliProviderInternals } from './providers/codexCli.js';
export {
  CODEX_PROVIDER,
  CODEX_CLI_PROVIDER,
  AUTO_PROVIDER,
  SUPPORTED_PROVIDERS,
  type ProviderId
} from './providers/types.js';
export type { Provider, ProviderGenerateArgs, ProviderResult, CodexResult, CodexCliResult, CommandResult } from './providers/provider.js';
