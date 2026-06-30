import { createHash } from "node:crypto";
import { execSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import type { Config } from "./config.js";
import type { Workspace } from "./workspace.js";

export interface HandoffPlan {
  text: string;
  hash: string;
}

export interface ExecutionLogEntry {
  ts: string;
  event: string;
  agent?: string;
  hash?: string;
  status?: string;
  exitCode?: number;
  message?: string;
  command?: string;
}

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

export function planHash(text: string): string {
  return sha256(text.trim());
}

export function isScaffoldPlan(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length === 0) return true;
  if (trimmed.length < 20) return true;
  const lower = trimmed.toLowerCase();
  if (lower === "# cc bridge handoff plan" || lower === "# plan") return true;
  return false;
}

export function ensureContextFiles(ws: Workspace, contextDir: string): void {
  const dir = join(ws.root, contextDir);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const files = [
    "current-plan.md",
    "agent-status.md",
    "codex-status.md",
    "implementation-diff.patch",
    "execution-log.jsonl",
    "decisions.md",
    "open-questions.md",
  ];
  for (const f of files) {
    const p = join(dir, f);
    if (!existsSync(p)) {
      if (f.endsWith(".jsonl")) writeFileSync(p, "");
      else writeFileSync(p, "");
    }
  }
}

export function writePlan(ws: Workspace, config: Config, planText: string): HandoffPlan {
  ensureContextFiles(ws, config.contextDir);
  const planPath = join(ws.root, config.contextDir, "current-plan.md");
  writeFileSync(planPath, planText, "utf8");
  const hash = planHash(planText);
  appendLog(ws, config, {
    ts: new Date().toISOString(),
    event: "plan_written",
    hash,
  });
  return { text: planText, hash };
}

export function readPlan(ws: Workspace, config: Config): string {
  const p = join(ws.root, config.contextDir, "current-plan.md");
  if (!existsSync(p)) return "";
  return readFileSync(p, "utf8");
}

export function appendLog(ws: Workspace, config: Config, entry: ExecutionLogEntry): void {
  const logPath = join(ws.root, config.contextDir, "execution-log.jsonl");
  appendFileSync(logPath, JSON.stringify(entry) + "\n", "utf8");
}

export function writeStatus(
  ws: Workspace,
  config: Config,
  file: "agent-status.md" | "codex-status.md",
  content: string,
): void {
  const p = join(ws.root, config.contextDir, file);
  writeFileSync(p, content, "utf8");
}

export function writeDiff(ws: Workspace, config: Config, patch: string): void {
  const p = join(ws.root, config.contextDir, "implementation-diff.patch");
  writeFileSync(p, patch, "utf8");
}

export interface ExecuteOptions {
  agent: string;
  model?: string;
  reasoningEffort?: "low" | "medium" | "high";
  once?: boolean;
  dryRun?: boolean;
  yes?: boolean;
  /** Override the agent command entirely (for tests). */
  commandOverride?: string[];
}

export interface ExecuteResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  dryRun: boolean;
  command: string[];
}

export function buildCodexCommand(planText: string, config: Config, opts: ExecuteOptions): string[] {
  const model = opts.model ?? config.handoffModel;
  if (config.handoffAgentCommand && config.handoffAgentCommand.length > 0) {
    return [...config.handoffAgentCommand.split(/\s+/), planText];
  }
  return ["codex", "exec", "--model", model, planText];
}

export async function executeHandoff(
  ws: Workspace,
  config: Config,
  opts: ExecuteOptions,
): Promise<ExecuteResult> {
  const planText = readPlan(ws, config);
  if (isScaffoldPlan(planText)) {
    throw new Error("Current plan is empty or a scaffold; nothing to execute.");
  }

  const command = opts.commandOverride ?? buildCodexCommand(planText, config, opts);

  if (opts.dryRun) {
    appendLog(ws, config, {
      ts: new Date().toISOString(),
      event: "execute_dry_run",
      agent: opts.agent,
      command: command.join(" "),
    });
    return { exitCode: 0, stdout: command.join(" "), stderr: "", dryRun: true, command };
  }

  // Require confirmation unless --yes.
  if (!opts.yes) {
    if (!process.stdin.isTTY) {
      throw new Error("Non-interactive shell requires --yes to execute handoff.");
    }
    // Confirmation handled by caller in CLI; here we just require yes.
    throw new Error("Confirmation required: pass --yes to execute.");
  }

  appendLog(ws, config, {
    ts: new Date().toISOString(),
    event: "execute_start",
    agent: opts.agent,
    hash: planHash(planText),
    command: command.join(" "),
  });

  const res = await runCommand(command, ws.root);

  writeStatus(
    ws,
    config,
    "codex-status.md",
    `# Codex Status\n\n- exit_code: ${res.exitCode}\n- ran_at: ${new Date().toISOString()}\n- command: ${command.join(" ")}\n`,
  );
  writeStatus(
    ws,
    config,
    "agent-status.md",
    `# Agent Status\n\n- last_agent: codex\n- last_exit_code: ${res.exitCode}\n- updated_at: ${new Date().toISOString()}\n`,
  );

  // Capture a diff patch if git is available.
  try {
    const patch = execSync("git diff", { cwd: ws.root, stdio: ["ignore", "pipe", "ignore"] }).toString("utf8");
    writeDiff(ws, config, patch);
  } catch {
    // ignore git errors
  }

  appendLog(ws, config, {
    ts: new Date().toISOString(),
    event: "execute_done",
    agent: opts.agent,
    exitCode: res.exitCode,
  });

  return { ...res, dryRun: false, command };
}

function runCommand(command: string[], cwd: string): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolveP, rejectP) => {
    const child = spawn(command[0]!, command.slice(1), {
      cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d.toString("utf8")));
    child.stderr.on("data", (d) => (stderr += d.toString("utf8")));
    child.on("error", rejectP);
    child.on("close", (code) => resolveP({ exitCode: code ?? 0, stdout, stderr }));
  });
}

export interface WatchState {
  lastHash: string | null;
}

export interface WatchCallbacks {
  onPlan: (plan: HandoffPlan) => Promise<void> | void;
  shouldExecute: (plan: HandoffPlan) => boolean;
}

export async function watchHandoff(
  ws: Workspace,
  config: Config,
  opts: ExecuteOptions,
  onEvent?: (msg: string) => void,
): Promise<void> {
  const log = onEvent ?? ((m: string) => console.error(m));
  let lastHash: string | null = null;
  let debounceTimer: NodeJS.Timeout | null = null;
  const debounceMs = 500;

  const planPath = join(ws.root, config.contextDir, "current-plan.md");
  // Seed with current hash to avoid re-running the existing plan on start.
  if (existsSync(planPath)) {
    lastHash = planHash(readFileSync(planPath, "utf8"));
  }

  const dir = join(ws.root, config.contextDir);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const tryExecute = async (): Promise<boolean> => {
    if (!existsSync(planPath)) return false;
    const text = readFileSync(planPath, "utf8");
    const hash = planHash(text);
    if (hash === lastHash) return false;
    lastHash = hash;
    if (isScaffoldPlan(text)) {
      log("Plan is scaffold/empty; skipping.");
      return false;
    }
    log(`New plan detected (hash ${hash.slice(0, 8)}).`);
    try {
      const res = await executeHandoff(ws, config, opts);
      log(`Execution finished: exit ${res.exitCode}${res.dryRun ? " (dry-run)" : ""}.`);
    } catch (e) {
      log(`Execution error: ${(e as Error).message}`);
    }
    return true;
  };

  const { watch } = await import("node:fs");

  if (opts.once) {
    // Wait for a new plan (poll briefly up to a few seconds), then exit.
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      const did = await tryExecute();
      if (did) {
        if (debounceTimer) clearTimeout(debounceTimer);
        return;
      }
      await new Promise((r) => setTimeout(r, 200));
    }
    log("watch --once: no new plan within timeout.");
    return;
  }

  const watcher = watch(dir, (_event, filename) => {
    if (filename !== "current-plan.md") return;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(tryExecute, debounceMs);
  });

  // Initial check.
  tryExecute();

  return new Promise<void>((resolveP) => {
    watcher.on("close", () => resolveP());
  });
}
