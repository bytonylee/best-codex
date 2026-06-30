import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { homedir } from "node:os";
import type { Workspace } from "./workspace.js";

export interface SkillInfo {
  name: string;
  description: string;
  source: "workspace" | "user";
  /** Sanitized path relative to source root, never an absolute user path. */
  path: string;
  /** Absolute real path (kept internally; not exposed to clients verbatim). */
  real: string;
}

const WORKSPACE_SKILL_DIRS = [".codex/skills", ".agents/skills", "skills"];
const USER_SKILL_DIRS = [
  join(homedir(), ".codex", "skills"),
  join(homedir(), ".agents", "skills"),
  join(homedir(), ".claude", "skills"),
];

export function discoverSkills(ws: Workspace, includePlugin: boolean): SkillInfo[] {
  const out: SkillInfo[] = [];
  const seen = new Set<string>();

  for (const dir of WORKSPACE_SKILL_DIRS) {
    const abs = join(ws.root, dir);
    collectFromDir(abs, "workspace", out, seen);
  }
  for (const dir of USER_SKILL_DIRS) {
    if (existsSync(dir)) collectFromDir(dir, "user", out, seen);
  }

  if (includePlugin) {
    const pluginCache = join(homedir(), ".codex", "plugins", "cache");
    if (existsSync(pluginCache)) collectFromDir(pluginCache, "user", out, seen);
  }

  return out;
}

function collectFromDir(
  dir: string,
  source: "workspace" | "user",
  out: SkillInfo[],
  seen: Set<string>,
): void {
  if (!existsSync(dir)) return;
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    const skillDir = join(dir, entry);
    let st;
    try {
      st = statSync(skillDir);
    } catch {
      continue;
    }
    if (!st.isDirectory()) continue;
    const md = join(skillDir, "SKILL.md");
    if (!existsSync(md)) continue;
    if (seen.has(entry)) continue;
    seen.add(entry);

    let description = "";
    try {
      const text = readFileSync(md, "utf8");
      description = extractDescription(text);
    } catch {
      // ignore
    }

    out.push({
      name: entry,
      description,
      source,
      path: relative(dir, skillDir).split(sep).join("/"),
      real: skillDir,
    });
  }
}

function extractDescription(md: string): string {
  // First non-empty, non-heading line after the first heading.
  const lines = md.split(/\r?\n/);
  let sawHeading = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (line.startsWith("#")) {
      sawHeading = true;
      continue;
    }
    if (sawHeading && line.length > 0) return line.slice(0, 200);
  }
  // Fallback: first heading text.
  for (const raw of lines) {
    const line = raw.trim();
    if (line.startsWith("#")) return line.replace(/^#+\s*/, "").slice(0, 200);
  }
  return "";
}

export function findSkill(skills: SkillInfo[], name: string): SkillInfo | undefined {
  return skills.find((s) => s.name === name);
}

export function readSkillMarkdown(skill: SkillInfo): string {
  return readFileSync(join(skill.real, "SKILL.md"), "utf8");
}

/** Bounded read under a discovered skill directory. */
export function readSkillFile(skill: SkillInfo, relPath: string, maxBytes: number): string {
  const clean = relPath.split(/\.\./).join(""); // reject traversal crudely
  const target = join(skill.real, clean);
  // Ensure target stays under skill.real.
  const rel = relative(skill.real, target);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error("Path escapes skill directory.");
  }
  const buf = readFileSync(target);
  if (buf.length > maxBytes) {
    return buf.subarray(0, maxBytes).toString("utf8") + "\n[truncated]";
  }
  return buf.toString("utf8");
}

function isAbsolute(p: string): boolean {
  return p.startsWith("/") || /^[A-Za-z]:[\\/]/.test(p);
}
