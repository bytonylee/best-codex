import {
  lstat,
  mkdir,
  readdir,
  readlink,
  rm,
  symlink,
} from "node:fs/promises";
import { basename, join } from "node:path";

import { AUTH_FILE, type HomeOptions, type ProfileOptions, resolveHomes, resolveProfileHomes } from "./paths.js";

export interface LinkOptions extends ProfileOptions {
  force?: boolean;
}

export function profileNameForAccount(account: number): string {
  if (!Number.isInteger(account) || account < 2) {
    throw new Error("account must be 2 or greater");
  }
  return `subs${account}`;
}

export async function initProfile(options: ProfileOptions): Promise<string[]> {
  const { accountRoot, targetHome } = resolveProfileHomes(options);
  await mkdir(accountRoot, { recursive: true });
  await mkdir(targetHome, { recursive: true });
  return [`created ${targetHome}`];
}

async function isCorrectSymlink(path: string, expectedTarget: string): Promise<boolean> {
  try {
    const stat = await lstat(path);
    return stat.isSymbolicLink() && (await readlink(path)) === expectedTarget;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

async function pathExists(path: string): Promise<boolean> {
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

export async function linkProfile(options: LinkOptions): Promise<string[]> {
  const { sourceHome, targetHome } = resolveProfileHomes(options);
  const sourceEntries = await readdir(sourceHome);
  const messages: string[] = [];

  await mkdir(targetHome, { recursive: true });

  for (const entry of sourceEntries.sort()) {
    if (entry === AUTH_FILE) {
      continue;
    }

    const sourcePath = join(sourceHome, entry);
    const targetPath = join(targetHome, basename(entry));

    if (await isCorrectSymlink(targetPath, sourcePath)) {
      continue;
    }

    if (await pathExists(targetPath)) {
      if (!options.force) {
        throw new Error(`target already exists: ${targetPath}. Use --force to replace non-auth conflicts.`);
      }
      if (entry === AUTH_FILE) {
        throw new Error(`refusing to replace auth file: ${targetPath}`);
      }
      await rm(targetPath, { recursive: true, force: true });
      messages.push(`replaced ${targetPath}`);
    }

    await symlink(sourcePath, targetPath);
    messages.push(`linked ${targetPath} -> ${sourcePath}`);
  }

  return messages;
}

export function renderAlias(profile: string, account?: number): string {
  const aliasNumber = account ?? Number(profile.replace(/^subs/, ""));
  return `alias codex${aliasNumber}='CODEX_HOME="$HOME/.codex-accounts/${profile}" codex'`;
}

export function renderAliases(accounts: number): string[] {
  if (!Number.isInteger(accounts) || accounts < 1) {
    throw new Error("accounts must be 1 or greater");
  }

  const aliases = [`alias codex1='CODEX_HOME="$HOME/.codex" codex'`];
  for (let account = 2; account <= accounts; account += 1) {
    aliases.push(renderAlias(profileNameForAccount(account), account));
  }
  return aliases;
}

export async function renderSetup(accounts: number, options: HomeOptions = {}): Promise<string[]> {
  if (!Number.isInteger(accounts) || accounts < 2) {
    throw new Error("accounts must be 2 or greater");
  }

  const { accountRoot } = resolveHomes(options);
  const profiles: string[] = [];
  for (let account = 2; account <= accounts; account += 1) {
    const name = profileNameForAccount(account);
    profiles.push(name);
    await initProfile({ ...options, name });
  }

  return [
    "Created account homes:",
    ...profiles.map((profile) => `- ${join(accountRoot, profile)}`),
    "",
    "Login each extra account:",
    ...profiles.map((profile) => `CODEX_HOME="${join(accountRoot, profile)}" codex login`),
    "",
    "After login, link shared Codex files and verify:",
    ...profiles.map((profile) => `codex-linker link ${profile}`),
    ...profiles.map((profile) => `codex-linker doctor ${profile}`),
    "",
    "Install aliases:",
    `codex-linker aliases --accounts ${accounts} >> ~/.zshrc`,
    "source ~/.zshrc",
  ];
}
