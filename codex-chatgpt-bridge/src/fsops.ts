import { createHash } from "node:crypto";
import { execFileSync, execSync } from "node:child_process";
import {
  existsSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  statSync,
  mkdirSync,
} from "node:fs";
import { join } from "node:path";
import { minimatch } from "minimatch";
import type { Workspace } from "./workspace.js";
import { WorkspaceError, redactSecrets, containsSecretLiteral } from "./workspace.js";

export interface TreeEntry {
  path: string;
  type: "file" | "dir";
}

export function tree(ws: Workspace, dirRel: string, maxEntries: number): TreeEntry[] {
  const resolved = ws.resolveChecked(dirRel);
  const out: TreeEntry[] = [];
  const walk = (abs: string, rel: string) => {
    if (out.length >= maxEntries) return;
    let entries: string[];
    try {
      entries = readdirSync(abs);
    } catch {
      return;
    }
    for (const name of entries) {
      if (out.length >= maxEntries) return;
      const childAbs = join(abs, name);
      const childRel = rel === "." ? name : `${rel}/${name}`;
      if (ws.isBlocked(childRel)) continue;
      let st;
      try {
        st = statSync(childAbs);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        out.push({ path: childRel, type: "dir" });
        walk(childAbs, childRel);
      } else if (st.isFile()) {
        out.push({ path: childRel, type: "file" });
      }
    }
  };
  walk(resolved.real, resolved.rel);
  return out;
}

export interface SearchHit {
  path: string;
  line: number;
  text: string;
}

export function search(
  ws: Workspace,
  query: string,
  opts: { maxResults?: number; glob?: string; ignoreCase?: boolean } = {},
): SearchHit[] {
  const max = opts.maxResults ?? 200;
  const hits: SearchHit[] = [];
  const re = new RegExp(escapeRegExp(query), opts.ignoreCase ? "i" : "");
  const walk = (abs: string, rel: string) => {
    if (hits.length >= max) return;
    let entries: string[];
    try {
      entries = readdirSync(abs);
    } catch {
      return;
    }
    for (const name of entries) {
      if (hits.length >= max) return;
      const childAbs = join(abs, name);
      const childRel = rel === "." ? name : `${rel}/${name}`;
      if (ws.isBlocked(childRel)) continue;
      let st;
      try {
        st = statSync(childAbs);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        walk(childAbs, childRel);
      } else if (st.isFile()) {
        if (opts.glob && !minimatch(childRel, opts.glob, { dot: true })) continue;
        try {
          const text = readFileSync(childAbs, "utf8");
          const lines = text.split(/\r?\n/);
          for (let i = 0; i < lines.length; i++) {
            if (re.test(lines[i]!)) {
              hits.push({ path: childRel, line: i + 1, text: redactSecrets(lines[i]!).slice(0, 500) });
              if (hits.length >= max) return;
            }
          }
        } catch {
          // binary or unreadable
        }
      }
    }
  };
  walk(ws.root, ".");
  return hits;
}

export interface ReadResult {
  path: string;
  content: string;
  lines: number;
  truncated: boolean;
}

export function readFile(
  ws: Workspace,
  rel: string,
  opts: { maxBytes?: number; startLine?: number; endLine?: number } = {},
): ReadResult {
  const max = opts.maxBytes ?? 256 * 1024;
  const resolved = ws.resolveChecked(rel);
  ws.assertSize(resolved.real, max);
  const raw = readFileSync(resolved.real, "utf8");
  const lines = raw.split(/\r?\n/);
  const start = opts.startLine ?? 1;
  const end = opts.endLine ?? lines.length;
  const slice = lines.slice(Math.max(0, start - 1), end);
  // Add line numbers.
  const numbered = slice.map((l, i) => `${start + i}\t${l}`).join("\n");
  const redacted = redactSecrets(numbered);
  return {
    path: resolved.rel,
    content: redacted,
    lines: slice.length,
    truncated: end < lines.length,
  };
}

export interface WriteResult {
  path: string;
  bytes: number;
  sha256: string;
  created: boolean;
}

export function writeFile(
  ws: Workspace,
  rel: string,
  content: string,
  opts: { overwrite?: boolean } = {},
): WriteResult {
  if (containsSecretLiteralSafe(content)) {
    throw new WorkspaceError("Content appears to contain secret literals; write blocked.", "secret");
  }
  const resolved = ws.resolve(rel);
  if (ws.isBlocked(resolved.rel)) {
    throw new WorkspaceError(`Path matches blocked glob: ${resolved.rel}`, "blocked");
  }
  const existed = existsSync(resolved.real);
  if (existed && !opts.overwrite) {
    throw new WorkspaceError(
      `File exists; pass overwrite:true to replace: ${resolved.rel}`,
      "exists",
    );
  }
  const parent = join(resolved.real, "..");
  if (!existsSync(parent)) mkdirSync(parent, { recursive: true });
  writeFileSync(resolved.real, content, "utf8");
  const buf = Buffer.from(content, "utf8");
  return {
    path: resolved.rel,
    bytes: buf.length,
    sha256: createHash("sha256").update(buf).digest("hex"),
    created: !existed,
  };
}

export interface EditResult {
  path: string;
  replacements: number;
  sha256: string;
}

export function editFile(
  ws: Workspace,
  rel: string,
  oldText: string,
  newText: string,
  opts: { replaceAll?: boolean } = {},
): EditResult {
  if (containsSecretLiteralSafe(newText)) {
    throw new WorkspaceError("New content appears to contain secret literals; edit blocked.", "secret");
  }
  const resolved = ws.resolveChecked(rel);
  const original = readFileSync(resolved.real, "utf8");
  if (!original.includes(oldText)) {
    throw new WorkspaceError("old_text not found in file.", "notfound");
  }
  let updated: string;
  let count: number;
  if (opts.replaceAll) {
    const parts = original.split(oldText);
    count = parts.length - 1;
    updated = parts.join(newText);
  } else {
    const idx = original.indexOf(oldText);
    if (original.indexOf(oldText, idx + 1) !== -1) {
      throw new WorkspaceError(
        "old_text is not unique; pass replace_all:true or provide more context.",
        "exists",
      );
    }
    updated = original.slice(0, idx) + newText + original.slice(idx + oldText.length);
    count = 1;
  }
  writeFileSync(resolved.real, updated, "utf8");
  return {
    path: resolved.rel,
    replacements: count,
    sha256: createHash("sha256").update(updated).digest("hex"),
  };
}

function containsSecretLiteralSafe(text: string): boolean {
  return containsSecretLiteral(text);
}

export function gitStatus(ws: Workspace): string {
  try {
    return execSync("git status --porcelain=v1", { cwd: ws.root, encoding: "utf8" });
  } catch (e) {
    return `git status failed: ${(e as Error).message}`;
  }
}

export function gitDiff(ws: Workspace, args: string[] = []): string {
  try {
    const safe = args.filter((a) => a === "--stat" || a === "--name-only");
    return execFileSync("git", ["diff", ...safe], {
      cwd: ws.root,
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
    });
  } catch (e) {
    return `git diff failed: ${(e as Error).message}`;
  }
}

export function showChanges(ws: Workspace): { status: string; diff: string } {
  return { status: gitStatus(ws), diff: gitDiff(ws, ["--stat"]) };
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
