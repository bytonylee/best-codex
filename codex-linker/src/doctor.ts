import { lstat, readdir, readlink } from "node:fs/promises";
import { join } from "node:path";

import { AUTH_FILE, type ProfileOptions, resolveProfileHomes } from "./paths.js";

export interface DoctorResult {
  ok: boolean;
  problems: string[];
}

async function exists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

export async function doctorProfile(options: ProfileOptions): Promise<DoctorResult> {
  const { sourceHome, targetHome } = resolveProfileHomes(options);
  const problems: string[] = [];

  if (!(await exists(sourceHome))) {
    problems.push(`${sourceHome} does not exist`);
  }
  if (!(await exists(targetHome))) {
    problems.push(`${targetHome} does not exist`);
  }
  if (problems.length > 0) {
    return { ok: false, problems };
  }

  const targetAuth = join(targetHome, AUTH_FILE);
  try {
    const authStat = await lstat(targetAuth);
    if (authStat.isSymbolicLink()) {
      problems.push(`${targetAuth} must be a real file, not a symlink`);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }

  const sourceEntries = await readdir(sourceHome);
  for (const entry of sourceEntries.sort()) {
    if (entry === AUTH_FILE) {
      continue;
    }

    const sourcePath = join(sourceHome, entry);
    const targetPath = join(targetHome, entry);
    try {
      const targetStat = await lstat(targetPath);
      if (!targetStat.isSymbolicLink()) {
        problems.push(`${targetPath} must be a symlink to ${sourcePath}`);
        continue;
      }
      const actualTarget = await readlink(targetPath);
      if (actualTarget !== sourcePath) {
        problems.push(`${targetPath} points to ${actualTarget}, expected ${sourcePath}`);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        problems.push(`${targetPath} is missing`);
      } else {
        throw error;
      }
    }
  }

  return { ok: problems.length === 0, problems };
}
