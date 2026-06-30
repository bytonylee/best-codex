import { createHash } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync, statSync } from "node:fs";
import { join, extname, normalize, isAbsolute, relative, sep } from "node:path";
import type { Workspace } from "./workspace.js";
import { WorkspaceError } from "./workspace.js";

export type ImageMime = "image/png" | "image/jpeg" | "image/webp" | "image/gif";

const ALLOWED_MIME: Record<ImageMime, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

const SIGNATURES: { mime: ImageMime; bytes: number[] }[] = [
  { mime: "image/png", bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mime: "image/jpeg", bytes: [0xff, 0xd8, 0xff] },
  { mime: "image/gif", bytes: [0x47, 0x49, 0x46, 0x38] },
  { mime: "image/webp", bytes: [0x52, 0x49, 0x46, 0x46] }, // RIFF....WEBP
];

export interface ImageSaveInput {
  /** Base64-encoded image data (universal fallback). */
  base64?: string;
  /** Raw bytes. */
  bytes?: Buffer;
  /** Declared MIME type. */
  mimeType: ImageMime;
  /** Optional explicit output path relative to workspace root. */
  outputPath?: string;
  /** Allow overwriting an existing file. */
  overwrite?: boolean;
  /** Slug for default filename. */
  slug?: string;
}

export interface ImageSaveResult {
  path: string;
  rel: string;
  bytes: number;
  sha256: string;
  mimeType: string;
  width?: number;
  height?: number;
  createdAt: string;
}

export function sniffMime(buf: Buffer): ImageMime | null {
  for (const sig of SIGNATURES) {
    if (buf.length < sig.bytes.length) continue;
    let match = true;
    for (let i = 0; i < sig.bytes.length; i++) {
      if (buf[i] !== sig.bytes[i]) {
        match = false;
        break;
      }
    }
    if (match) {
      // WebP needs the WEBP fourcc at offset 8.
      if (sig.mime === "image/webp") {
        if (buf.length >= 12 && buf.slice(8, 12).toString("ascii") === "WEBP") {
          return "image/webp";
        }
        continue;
      }
      return sig.mime;
    }
  }
  return null;
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "image";
}

export function saveImage(
  ws: Workspace,
  input: ImageSaveInput,
  maxBytes: number,
  imageDir: string,
): ImageSaveResult {
  let buf: Buffer;
  if (input.bytes) {
    buf = input.bytes;
  } else if (input.base64) {
    buf = Buffer.from(input.base64, "base64");
  } else {
    throw new WorkspaceError("No image data provided (need base64 or bytes).", "notfound");
  }

  if (buf.length === 0) {
    throw new WorkspaceError("Image data is empty.", "size");
  }
  if (buf.length > maxBytes) {
    throw new WorkspaceError(
      `Image exceeds max size: ${buf.length} > ${maxBytes}`,
      "size",
    );
  }

  const sniffed = sniffMime(buf);
  if (!sniffed) {
    throw new WorkspaceError("Could not sniff image signature from bytes.", "blocked");
  }
  if (sniffed !== input.mimeType) {
    throw new WorkspaceError(
      `Declared MIME ${input.mimeType} does not match sniffed ${sniffed}.`,
      "blocked",
    );
  }

  if (!(input.mimeType in ALLOWED_MIME)) {
    throw new WorkspaceError(`MIME type not allowed: ${input.mimeType}`, "blocked");
  }

  const ext = ALLOWED_MIME[input.mimeType];
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const hash = createHash("sha256").update(buf).digest("hex").slice(0, 12);
  const slug = slugify(input.slug ?? "image");

  let relPath: string;
  if (input.outputPath) {
    // Must be relative and confined to workspace.
    if (isAbsolute(input.outputPath) || input.outputPath.includes("..")) {
      throw new WorkspaceError("Explicit output path must be relative to workspace.", "escape");
    }
    relPath = normalize(input.outputPath).split(sep).join("/");
  } else {
    relPath = `${imageDir}/${slug}-${ts}-${hash}.${ext}`;
  }

  const resolved = ws.resolve(relPath);
  // Ensure parent dir exists.
  const parent = join(resolved.real, "..");
  if (!existsSync(parent)) mkdirSync(parent, { recursive: true });

  if (existsSync(resolved.real) && !input.overwrite) {
    throw new WorkspaceError(
      `Output file exists and overwrite not allowed: ${resolved.rel}`,
      "exists",
    );
  }

  writeFileSync(resolved.real, buf);
  const st = statSync(resolved.real);

  const dims = detectDimensions(buf, input.mimeType);

  return {
    path: resolved.real,
    rel: resolved.rel,
    bytes: st.size,
    sha256: createHash("sha256").update(buf).digest("hex"),
    mimeType: input.mimeType,
    width: dims?.width,
    height: dims?.height,
    createdAt: new Date().toISOString(),
  };
}

function detectDimensions(buf: Buffer, mime: ImageMime): { width: number; height: number } | undefined {
  try {
    if (mime === "image/png") {
      return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
    }
    if (mime === "image/gif") {
      return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
    }
    if (mime === "image/webp") {
      // VP8X at offset 12: width-1 (3 bytes LE), height-1 (3 bytes LE)
      const w = (buf[20]! | (buf[21]! << 8) | (buf[22]! << 16)) + 1;
      const h = (buf[24]! | (buf[25]! << 8) | (buf[26]! << 16)) + 1;
      return { width: w, height: h };
    }
    if (mime === "image/jpeg") {
      return scanJpegDimensions(buf);
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function scanJpegDimensions(buf: Buffer): { width: number; height: number } | undefined {
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) return undefined;
    const marker = buf[i + 1];
    if (marker === undefined) return undefined;
    // SOFn markers: 0xc0..0xcf (except 0xc4,0xc8,0xcc)
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      const height = buf.readUInt16BE(i + 5);
      const width = buf.readUInt16BE(i + 7);
      return { width, height };
    }
    const len = buf.readUInt16BE(i + 2);
    i += 2 + len;
  }
  return undefined;
}

export function isAllowedMime(mime: string): mime is ImageMime {
  return mime in ALLOWED_MIME;
}
