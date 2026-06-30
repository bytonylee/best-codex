import { createHash } from "node:crypto";
import { lstatSync, realpathSync, statSync } from "node:fs";
import { resolve, relative, isAbsolute, sep, normalize } from "node:path";
import { minimatch } from "minimatch";
import type { Config } from "./config.js";

export class WorkspaceError extends Error {
  constructor(
    message: string,
    readonly code: "escape" | "blocked" | "symlink" | "size" | "notfound" | "exists" | "secret",
  ) {
    super(message);
    this.name = "WorkspaceError";
  }
}

export interface ResolvedPath {
  /** Absolute real path inside the workspace. */
  real: string;
  /** Path relative to the workspace root (POSIX separators). */
  rel: string;
}

export class Workspace {
  readonly root: string;
  private blockedGlobs: string[];

  constructor(private config: Config) {
    this.root = realpathSafe(config.root);
    this.blockedGlobs = config.blockedGlobs;
  }

  /** Resolve a user-supplied path (absolute or relative) to a confined real path. */
  resolve(userPath: string): ResolvedPath {
    const abs = isAbsolute(userPath) ? normalize(userPath) : resolve(this.root, userPath);
    const real = realpathSafe(abs);
    if (!isInside(this.root, real)) {
      throw new WorkspaceError(
        `Path escapes workspace root: ${userPath}`,
        "escape",
      );
    }
    const rel = relative(this.root, real).split(sep).join("/");
    return { real, rel: rel === "" ? "." : rel };
  }

  /** Resolve and verify the target is not blocked, accounting for symlinks. */
  resolveChecked(
    userPath: string,
    opts: { allowBlockedRead?: boolean } = {},
  ): ResolvedPath {
    const resolved = this.resolve(userPath);
    if (!opts.allowBlockedRead && this.isBlocked(resolved.rel)) {
      throw new WorkspaceError(`Path matches blocked glob: ${resolved.rel}`, "blocked");
    }
    // Detect symlink escape: if the lexical abs path differs from the real path
    // and the real path is outside root, reject (covered by resolve() already).
    // Also reject if the immediate path is a symlink pointing outside root.
    this.checkSymlinkEscape(userPath);
    return resolved;
  }

  private checkSymlinkEscape(userPath: string): void {
    const abs = isAbsolute(userPath) ? normalize(userPath) : resolve(this.root, userPath);
    // Walk each ancestor segment; if any is a symlink whose target escapes root, reject.
    let cur = this.root;
    const segments = relative(this.root, abs).split(sep).filter(Boolean);
    for (const seg of segments) {
      const next = resolve(cur, seg);
      try {
        const st = lstatSync(next);
        if (st.isSymbolicLink()) {
          const real = realpathSync(next);
          if (!isInside(this.root, real)) {
            throw new WorkspaceError(
              `Symlink escapes workspace: ${next} -> ${real}`,
              "symlink",
            );
          }
        }
      } catch (e) {
        if (e instanceof WorkspaceError) throw e;
        // Missing path is fine for write targets.
      }
      cur = next;
    }
  }

  isBlocked(rel: string): boolean {
    const posix = rel.split(sep).join("/");
    return this.blockedGlobs.some((g) => minimatch(posix, g, { dot: true }));
  }

  assertSize(real: string, maxBytes: number): void {
    let size: number;
    try {
      size = statSync(real).size;
    } catch {
      throw new WorkspaceError(`File not found: ${real}`, "notfound");
    }
    if (size > maxBytes) {
      throw new WorkspaceError(
        `File exceeds size limit: ${size} > ${maxBytes}`,
        "size",
      );
    }
  }
}

function realpathSafe(p: string): string {
  try {
    return realpathSync(p);
  } catch {
    // For paths that don't yet exist, resolve the parent and join the basename.
    const parent = resolve(p, "..");
    const base = relative(parent, p);
    try {
      return resolve(realpathSync(parent), base);
    } catch {
      return resolve(p);
    }
  }
}

export function isInside(root: string, target: string): boolean {
  const r = root.endsWith(sep) ? root : root + sep;
  if (target === root) return true;
  return target.startsWith(r);
}

// --- Secret detection / redaction ---

const SECRET_PATTERNS: RegExp[] = [
  /(?:sk|pk|tok|token|secret|password|passwd|api[_-]?key|access[_-]?key|private[_-]?key)["']?\s*[:=]\s*["']?[A-Za-z0-9_\-+/=]{16,}["']?/gi,
  /-----BEGIN [A-Z ]+PRIVATE KEY-----[\s\S]*?-----END [A-Z ]+PRIVATE KEY-----/g,
  /ghp_[A-Za-z0-9]{36,}/g,
  /gho_[A-Za-z0-9]{36,}/g,
  /AKIA[0-9A-Z]{16}/g,
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, // JWTs
];

const SECRET_VALUE_HINTS = [
  "token",
  "secret",
  "password",
  "passwd",
  "api_key",
  "apikey",
  "api-key",
  "access_key",
  "private_key",
  "privatekey",
  "client_secret",
  "auth",
];

export function looksSecret(line: string): boolean {
  const lower = line.toLowerCase();
  if (!SECRET_VALUE_HINTS.some((h) => lower.includes(h))) return false;
  // value-like assignment with a long opaque value
  return /[:=]\s*["']?[A-Za-z0-9_\-+/=]{16,}["']?/.test(line);
}

export function redactSecrets(text: string): string {
  let out = text;
  for (const re of SECRET_PATTERNS) {
    out = out.replace(re, "[REDACTED]");
  }
  // Redact assignment-style secrets in env/key files.
  out = out.replace(
    /^(\s*(?:export\s+)?[A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|PASSWD|API_KEY|APIKEY|ACCESS_KEY|PRIVATE_KEY|CLIENT_SECRET)[A-Z0-9_]*)\s*[:=]\s*.+$/gim,
    "$1=[REDACTED]",
  );
  return out;
}

export function containsSecretLiteral(text: string): boolean {
  for (const re of SECRET_PATTERNS) {
    if (re.test(text)) return true;
  }
  // line-by-line heuristic
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    if (looksSecret(line)) return true;
  }
  return false;
}

export function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}
