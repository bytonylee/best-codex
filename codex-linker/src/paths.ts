import { homedir } from "node:os";
import { join, resolve } from "node:path";

export const AUTH_FILE = "auth.json";

export interface HomeOptions {
  home?: string;
  sourceHome?: string;
  accountRoot?: string;
}

export interface ResolvedHomes {
  home: string;
  sourceHome: string;
  accountRoot: string;
}

export interface ProfileOptions extends HomeOptions {
  name: string;
}

export interface ResolvedProfileHomes extends ResolvedHomes {
  name: string;
  targetHome: string;
}

export function expandHome(path: string, home = homedir()): string {
  if (path === "~") {
    return home;
  }
  if (path.startsWith("~/")) {
    return join(home, path.slice(2));
  }
  if (path === "$HOME") {
    return home;
  }
  if (path.startsWith("$HOME/")) {
    return join(home, path.slice(6));
  }
  return path;
}

export function assertValidProfileName(name: string): void {
  if (!/^[A-Za-z0-9_-]+$/.test(name) || name.includes("..")) {
    throw new Error("invalid profile name: use letters, numbers, underscores, or dashes");
  }
}

export function resolveHomes(options: HomeOptions = {}): ResolvedHomes {
  const home = resolve(expandHome(options.home ?? homedir()));
  const sourceHome = resolve(expandHome(options.sourceHome ?? join(home, ".codex"), home));
  const accountRoot = resolve(expandHome(options.accountRoot ?? join(home, ".codex-accounts"), home));
  return { home, sourceHome, accountRoot };
}

export function resolveProfileHomes(options: ProfileOptions): ResolvedProfileHomes {
  assertValidProfileName(options.name);
  const homes = resolveHomes(options);
  return {
    ...homes,
    name: options.name,
    targetHome: join(homes.accountRoot, options.name),
  };
}
