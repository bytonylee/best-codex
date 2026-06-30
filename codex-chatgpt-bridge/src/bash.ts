import { spawn } from "node:child_process";
import { isAbsolute, resolve, sep } from "node:path";
import type { Config } from "./config.js";

export class BashError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
    this.name = "BashError";
  }
}

// Allowlist of safe verification / bounded git inspection commands.
// Each entry is a command prefix that must match the start of the (normalized) argv.
const ALLOWED_PREFIXES: string[][] = [
  ["npm", "test"],
  ["npm", "run", "test"],
  ["npm", "run", "typecheck"],
  ["npm", "run", "lint"],
  ["npm", "run", "build"],
  ["npm", "run", "check"],
  ["pnpm", "test"],
  ["pnpm", "run", "test"],
  ["pnpm", "typecheck"],
  ["pnpm", "lint"],
  ["pnpm", "build"],
  ["pnpm", "check"],
  ["yarn", "test"],
  ["yarn", "typecheck"],
  ["yarn", "lint"],
  ["yarn", "build"],
  ["yarn", "check"],
  ["bun", "test"],
  ["bun", "run", "test"],
  ["bun", "typecheck"],
  ["bun", "lint"],
  ["bun", "build"],
  ["bun", "check"],
  ["pytest"],
  ["python", "-m", "pytest"],
  ["go", "test"],
  ["cargo", "test"],
  ["cargo", "check"],
  ["cargo", "clippy"],
  ["git", "status"],
  ["git", "diff"],
  ["git", "log"],
  ["git", "show"],
  ["git", "branch"],
  ["git", "rev-parse"],
  ["git", "ls-files"],
];

const BLOCKED_SUBSTRINGS = [
  "--fix",
];

const BLOCKED_TOKENS = new Set([
  "rm",
  "rmdir",
  "mv",
  "cp",
  "chmod",
  "chown",
  "chgrp",
  "kill",
  "pkill",
  "shutdown",
  "reboot",
  "sudo",
  "su",
  "doas",
  "git",
  // git handled separately for allowed read-only subcommands
]);

const DESTRUCTIVE_GIT_SUBCOMMANDS = new Set([
  "push",
  "pull",
  "fetch",
  "merge",
  "rebase",
  "reset",
  "checkout",
  "switch",
  "restore",
  "clean",
  "commit",
  "stash",
  "cherry-pick",
  "revert",
  "init",
  "clone",
  "mv",
  "rm",
]);

const NETWORK_TOKENS = new Set([
  "curl",
  "wget",
  "ssh",
  "scp",
  "sftp",
  "rsync",
  "nc",
  "netcat",
  "docker",
  "kubectl",
  "podman",
]);

const PUBLISH_TOKENS = new Set([
  "npm",
  "pnpm",
  "yarn",
  "publish",
]);

const SHELL_METACHARS = /[|;&><$`\n\\]|\$\(|`|\$\{|&&|\|\|/;

const FILE_INSPECT_TOKENS = new Set([
  "cat",
  "head",
  "tail",
  "less",
  "more",
  "vi",
  "vim",
  "nano",
  "emacs",
  "sed",
  "awk",
  "grep",
  "rg",
  "find",
  "fd",
  "xxd",
  "hexdump",
  "strings",
]);

/** Tokenize a command string into argv, rejecting shell metacharacters. */
export function tokenize(command: string): string[] {
  if (command.trim() === "") {
    throw new BashError("Empty command", "empty");
  }
  if (SHELL_METACHARS.test(command)) {
    throw new BashError(
      "Shell operators, pipes, redirection, command substitution, backticks, and newlines are blocked.",
      "metachar",
    );
  }
  // Simple whitespace tokenizer (no quoting needed since metachars are blocked,
  // but allow simple double-quoted args without metachars).
  const args: string[] = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(command)) !== null) {
    args.push(m[1] ?? m[2] ?? m[3]);
  }
  return args;
}

export function validate(args: string[]): void {
  if (args.length === 0) throw new BashError("Empty command", "empty");

  const cmd = args[0];
  if (!cmd) throw new BashError("Empty command", "empty");

  // Reject absolute/home/parent paths in any token.
  for (const a of args) {
    if (isAbsolute(a) || a === "~" || a.startsWith("~/") || a.includes("..")) {
      throw new BashError(
        `Absolute paths, home paths, and parent-directory traversal are blocked: ${a}`,
        "path",
      );
    }
    if (a.startsWith("$") || a.includes("${")) {
      throw new BashError("Environment expansion is blocked.", "envexpansion");
    }
  }

  // Reject blocked substrings (e.g. --fix).
  for (const a of args) {
    for (const sub of BLOCKED_SUBSTRINGS) {
      if (a === sub || a.startsWith(sub + "=")) {
        throw new BashError(`Blocked flag: ${sub}`, "blockedflag");
      }
    }
  }

  // File-inspection commands should use dedicated tools.
  if (FILE_INSPECT_TOKENS.has(cmd)) {
    throw new BashError(
      `Use dedicated tools instead of '${cmd}' for file inspection.`,
      "fileinspect",
    );
  }

  // Network commands.
  if (NETWORK_TOKENS.has(cmd)) {
    throw new BashError(`Network command blocked: ${cmd}`, "network");
  }

  // Destructive base commands.
  if (BLOCKED_TOKENS.has(cmd) && cmd !== "git") {
    throw new BashError(`Destructive command blocked: ${cmd}`, "destructive");
  }

  // Publish.
  if (args.includes("publish") && PUBLISH_TOKENS.has(cmd)) {
    throw new BashError("Package publish commands are blocked.", "publish");
  }

  // Git: only allow read-only subcommands.
  if (cmd === "git") {
    const sub = args[1];
    if (!sub || DESTRUCTIVE_GIT_SUBCOMMANDS.has(sub)) {
      throw new BashError(`Destructive git subcommand blocked: git ${sub ?? ""}`.trim(), "git");
    }
  }

  // Must match an allowed prefix.
  if (!matchesAllowedPrefix(args)) {
    throw new BashError(`Command not on safe allowlist: ${args.join(" ")}`, "notallowed");
  }
}

function matchesAllowedPrefix(args: string[]): boolean {
  return ALLOWED_PREFIXES.some((prefix) => {
    if (args.length < prefix.length) return false;
    for (let i = 0; i < prefix.length; i++) {
      if (args[i] !== prefix[i]) return false;
    }
    // Remaining args must not introduce blocked patterns; allow flags/paths for git log/show/diff etc.
    return true;
  });
}

export interface BashResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  truncated: boolean;
}

export async function run(command: string, config: Config, cwd: string): Promise<BashResult> {
  const args = tokenize(command);
  validate(args);

  return new Promise((resolveP, rejectP) => {
    const child = spawn(args[0]!, args.slice(1), {
      cwd,
      env: { ...process.env, CI: "1" },
      stdio: ["ignore", "pipe", "pipe"],
      timeout: config.bashTimeoutMs,
    });

    let stdout = "";
    let stderr = "";
    let truncated = false;
    const max = config.maxBashOutputBytes;

    child.stdout.on("data", (d: Buffer) => {
      if (stdout.length < max) {
        const room = max - stdout.length;
        stdout += d.subarray(0, room).toString("utf8");
        if (d.length > room) truncated = true;
      } else {
        truncated = true;
      }
    });
    child.stderr.on("data", (d: Buffer) => {
      if (stderr.length < max) {
        const room = max - stderr.length;
        stderr += d.subarray(0, room).toString("utf8");
        if (d.length > room) truncated = true;
      } else {
        truncated = true;
      }
    });

    child.on("error", rejectP);
    child.on("close", (code) => {
      resolveP({ exitCode: code ?? 0, stdout, stderr, truncated });
    });
  });
}

export { ALLOWED_PREFIXES };
