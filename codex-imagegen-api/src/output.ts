import fs from 'node:fs/promises';
import path from 'node:path';

export const OUTPUT_COLLISION_LIMIT = 1000;

export interface PlannedOutputImage {
  index: number;
  filename: string;
  path: string;
  relativePath: string;
}

export interface PlannedOutput {
  outputRoot: string;
  outputDir: string;
  relativeOutputDir: string;
  slug: string;
  images: PlannedOutputImage[];
}

interface OutputPathArgs {
  outputRoot: string;
  prompt: string;
  count: number;
  now?: Date;
}

interface AllocateOutputPathArgs extends OutputPathArgs {
  rejectSymlinks?: boolean;
  maxAttempts?: number;
}

function localDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function toPosix(value: string): string {
  return value.split(path.sep).join('/');
}

function isAsciiAlphaNumeric(char: string): boolean {
  const code = char.charCodeAt(0);
  return (code >= 48 && code <= 57) || (code >= 97 && code <= 122);
}

export function slugFromPrompt(prompt: string): string {
  const firstWords = prompt.trim().split(/\s+/).filter(Boolean).slice(0, 15).join(' ');
  let slug = '';
  let lastWasDash = false;

  for (const char of firstWords.normalize('NFKD').toLowerCase()) {
    if (isAsciiAlphaNumeric(char)) {
      slug += char;
      lastWasDash = false;
      continue;
    }
    if (!lastWasDash && slug.length > 0) {
      slug += '-';
      lastWasDash = true;
    }
  }

  slug = slug.slice(0, 80).replace(/-+$/g, '');
  return slug || 'image';
}

export function imageFilename(index: number, count: number): string {
  return count > 1 ? `image-${index + 1}.png` : 'image.png';
}

function buildOutput(args: OutputPathArgs & { suffix?: number }): PlannedOutput {
  const outputRoot = path.resolve(args.outputRoot);
  const dateDir = localDateString(args.now ?? new Date());
  const baseSlug = slugFromPrompt(args.prompt);
  const slug = args.suffix ? `${baseSlug}-${args.suffix}` : baseSlug;
  const outputDir = path.join(outputRoot, dateDir, slug);
  const relativeOutputDir = toPosix(path.relative(outputRoot, outputDir));
  const images = Array.from({ length: args.count }, (_, index) => {
    const filename = imageFilename(index, args.count);
    const imagePath = path.join(outputDir, filename);
    return {
      index,
      filename,
      path: imagePath,
      relativePath: toPosix(path.relative(outputRoot, imagePath))
    };
  });

  return { outputRoot, outputDir, relativeOutputDir, slug, images };
}

export function planOutputPaths(args: OutputPathArgs): PlannedOutput {
  return buildOutput(args);
}

function isInsideRoot(root: string, candidate: string): boolean {
  const rel = path.relative(root, candidate);
  return rel === '' || (!rel.startsWith('..' + path.sep) && rel !== '..' && !path.isAbsolute(rel));
}

async function rejectSymlinkComponents(candidate: string, root: string): Promise<void> {
  if (!isInsideRoot(root, candidate)) {
    throw new Error(`output path escapes the output root: ${candidate}`);
  }
  const rel = path.relative(root, candidate);
  if (!rel) return;

  let current = root;
  for (const segment of rel.split(path.sep)) {
    current = path.join(current, segment);
    let stat;
    try {
      stat = await fs.lstat(current);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw e;
    }
    if (stat.isSymbolicLink()) {
      throw new Error(`output path must not contain symlinks: ${candidate}`);
    }
  }
}

export async function allocateOutputPaths({
  outputRoot,
  prompt,
  count,
  now = new Date(),
  rejectSymlinks = false,
  maxAttempts = OUTPUT_COLLISION_LIMIT
}: AllocateOutputPathArgs): Promise<PlannedOutput> {
  await fs.mkdir(outputRoot, { recursive: true });
  const root = await fs.realpath(path.resolve(outputRoot));
  const dateDir = path.join(root, localDateString(now));
  if (rejectSymlinks) await rejectSymlinkComponents(dateDir, root);
  await fs.mkdir(dateDir, { recursive: true });
  if (rejectSymlinks) await rejectSymlinkComponents(dateDir, root);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const planned = buildOutput({
      outputRoot: root,
      prompt,
      count,
      now,
      suffix: attempt === 1 ? undefined : attempt
    });
    try {
      await fs.mkdir(planned.outputDir);
      return planned;
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (code !== 'EEXIST') throw e;
      if (rejectSymlinks) {
        const stat = await fs.lstat(planned.outputDir).catch(() => null);
        if (stat?.isSymbolicLink()) {
          throw new Error(`output path must not contain symlinks: ${planned.outputDir}`);
        }
      }
    }
  }

  throw new Error(`Unable to allocate output directory after ${maxAttempts} attempts.`);
}
