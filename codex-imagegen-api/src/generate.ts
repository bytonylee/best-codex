// Core image generation: streams from private Codex backend, saves PNG(s).
// Supports number (count), aspect_ratio, reference_file.
import fs from 'node:fs/promises';
import path from 'node:path';

import { loadSession, validateSession } from './auth.js';
import { type Config } from './config.js';
import { CodedError } from './errors.js';
import { buildRequest } from './request.js';
import { createSseParser, extractImage } from './sse.js';
import { normalizeGenerationOptions } from './options.js';
import { allocateOutputPaths, planOutputPaths, type PlannedOutput } from './output.js';

const EXT_TO_MIME: Readonly<Record<string, string>> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  gif: 'image/gif', webp: 'image/webp'
};

export async function readImageAsDataUrl(imagePath: string): Promise<string> {
  const resolved = path.resolve(imagePath);
  const stat = await fs.stat(resolved).catch(() => {
    throw new Error(`reference_file not found: ${imagePath}`);
  });
  if (!stat.isFile()) throw new Error(`reference_file is not a file: ${imagePath}`);

  const ext = path.extname(resolved).toLowerCase().replace(/^\./, '');
  const mime = EXT_TO_MIME[ext];
  if (!mime) {
    throw new Error(`Unsupported reference_file extension "${ext}". Supported: png, jpg, jpeg, gif, webp.`);
  }
  const buf = await fs.readFile(resolved);
  return `data:${mime};base64,${buf.toString('base64')}`;
}

async function savePng(base64: string, outputPath: string): Promise<string> {
  const trimmed = base64.trim();
  if (/^data:/i.test(trimmed)) {
    throw new CodedError('Expected raw base64 PNG bytes, not a data URL.', 'UNSUPPORTED_DATA_URL');
  }
  const bytes = Buffer.from(trimmed, 'base64');
  if (!bytes.length) {
    throw new CodedError('Decoded image payload is empty.', 'EMPTY_IMAGE_PAYLOAD');
  }
  await fs.writeFile(outputPath, bytes, { flag: 'wx' });
  return outputPath;
}

export interface GenerateImageArgs {
  prompt: string;
  number?: number | string;
  aspect_ratio?: string;
  reference_file?: string | string[];
  outputDir?: string;
  outputPrefix?: string;
  config: Config;
  dryRun?: boolean;
  rejectOutputSymlinks?: boolean;
}

export interface GeneratedImage {
  index: number;
  savedPath?: string;
  relativePath?: string;
  plannedPath?: string;
  relativePlannedPath?: string;
  revisedPrompt?: string | null;
  responseId?: string | null;
  sessionId?: string;
  request?: {
    url: string;
    sessionId: string;
    size: string;
    model: string;
  };
}

export interface GenerationResult {
  images: GeneratedImage[];
  warnings: string[];
  outputRoot?: string;
  outputDir?: string;
  relativeOutputDir?: string;
  slug?: string;
}

export class GenerationFailedError extends CodedError {
  readonly partialResult: GenerationResult;

  constructor(message: string, code: string, partialResult: GenerationResult, cause?: unknown) {
    super(message, code, { cause });
    this.partialResult = partialResult;
  }
}

/**
 * Generate one or more images.
 */
export async function generateImage(opts: GenerateImageArgs): Promise<GenerationResult> {
  const config = opts.config;
  const normalized = normalizeGenerationOptions(opts, {
    outputDir: config.defaultOutputDir
  });
  const { number, size } = normalized;
  const dryRun = opts.dryRun ?? false;

  // Load reference images as data URLs (shared across all N requests).
  const referenceFiles = normalized.referenceFiles;
  let images: string[] | undefined;
  if (referenceFiles.length > 0) {
    images = await Promise.all(referenceFiles.map(readImageAsDataUrl));
  }

  const session = await loadSession(config);
  const { warnings } = validateSession(session);

  const outputRoot = normalized.outputDir ?? config.defaultOutputDir;
  const outputPlan: PlannedOutput = dryRun
    ? planOutputPaths({ outputRoot, prompt: normalized.prompt, count: number })
    : await allocateOutputPaths({
      outputRoot,
      prompt: normalized.prompt,
      count: number,
      rejectSymlinks: opts.rejectOutputSymlinks ?? false
    });

  if (dryRun) {
    const req = buildRequest({
      baseUrl: config.baseUrl, session, prompt: normalized.prompt,
      model: config.model, originator: config.originator, images, size
    });
    return {
      images: Array.from({ length: number }, (_, i) => ({
        index: i,
        plannedPath: outputPlan.images[i]?.path,
        relativePlannedPath: outputPlan.images[i]?.relativePath,
        request: { url: req.url, sessionId: req.sessionId, size, model: config.model }
      })),
      warnings: [
        ...warnings,
        'Dry run did not create or reserve an output directory; a live run may receive a numeric suffix.'
      ],
      outputRoot: outputPlan.outputRoot,
      outputDir: outputPlan.outputDir,
      relativeOutputDir: outputPlan.relativeOutputDir,
      slug: outputPlan.slug
    };
  }

  const generateOne = async (i: number): Promise<GeneratedImage> => {
    const req = buildRequest({
      baseUrl: config.baseUrl, session, prompt: normalized.prompt,
      model: config.model, originator: config.originator, images, size
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 300_000);

    let response: Response;
    try {
      response = await fetch(req.url, {
        method: 'POST',
        headers: req.headers,
        body: JSON.stringify(req.body),
        signal: controller.signal
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      if (response.status === 401) {
        throw new CodedError(
          `Unauthorized (401). Your ChatGPT auth may be expired. Run: codex login\n${body.slice(0, 200)}`,
          'AUTH_EXPIRED'
        );
      }
      if (response.status === 429) {
        throw new CodedError(`Backend rate limited (429): ${body.slice(0, 300)}`, 'RATE_LIMITED');
      }
      throw new CodedError(`Backend returned HTTP ${response.status}: ${body.slice(0, 300)}`, 'BACKEND_ERROR');
    }

    // Stream the SSE response body incrementally (memory-efficient).
    const parser = createSseParser();
    if (!response.body) throw new Error('Response body is empty.');
    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      parser.processChunk(decoder.decode(value, { stream: true }));
    }
    parser.processChunk(decoder.decode()); // flush

    const gen = extractImage(parser);
    const plannedImage = outputPlan.images[i];
    if (!plannedImage) throw new Error(`Missing output plan for image index ${i}.`);
    const savedPath = await savePng(gen.resultBase64, plannedImage.path);

    return {
      index: i,
      savedPath,
      relativePath: plannedImage.relativePath,
      revisedPrompt: gen.revisedPrompt,
      responseId: parser.responseId,
      sessionId: req.sessionId
    };
  };

  const results: GeneratedImage[] = [];
  for (let i = 0; i < number; i++) {
    try {
      results.push(await generateOne(i));
    } catch (e) {
      throw new GenerationFailedError(
        (e as Error)?.message || String(e),
        e instanceof CodedError ? e.code : 'GENERATE_FAILED',
        {
          images: results,
          warnings,
          outputRoot: outputPlan.outputRoot,
          outputDir: outputPlan.outputDir,
          relativeOutputDir: outputPlan.relativeOutputDir,
          slug: outputPlan.slug
        },
        e
      );
    }
  }

  return {
    images: results,
    warnings,
    outputRoot: outputPlan.outputRoot,
    outputDir: outputPlan.outputDir,
    relativeOutputDir: outputPlan.relativeOutputDir,
    slug: outputPlan.slug
  };
}
