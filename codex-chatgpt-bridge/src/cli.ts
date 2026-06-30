#!/usr/bin/env node
import { resolve as resolvePath } from "node:path";
import { parseArgs } from "node:util";
import { resolveConfig, Config, TunnelMode } from "./config.js";
import { launch, printStartup } from "./launcher.js";
import { Workspace } from "./workspace.js";
import {
  executeHandoff,
  watchHandoff,
  readPlan,
  isScaffoldPlan,
  ensureContextFiles,
} from "./handoff.js";

function die(msg: string): never {
  console.error(`cc-bridge: ${msg}`);
  process.exit(1);
}

function parseTunnel(v: string): TunnelMode {
  if (v === "none" || v === "cloudflare" || v === "ngrok") return v;
  die(`Invalid tunnel mode: ${v}`);
}

async function main(): Promise<void> {
  const [, , subcommand] = process.argv;
  const rest = process.argv.slice(2).filter((a) => a !== subcommand);

  if (!subcommand || subcommand === "--help" || subcommand === "-h") {
    printHelp();
    process.exit(0);
  }

  if (subcommand === "start") {
    const { values } = parseArgs({
      args: rest,
      options: {
        root: { type: "string" },
        port: { type: "string" },
        host: { type: "string" },
        token: { type: "string" },
        tunnel: { type: "string" },
        "ngrok-hostname": { type: "string" },
        "no-auth": { type: "boolean" },
        "include-plugin-skills": { type: "boolean" },
      },
      strict: false,
    });
    const config = resolveConfig({
      root: values.root ? resolvePath(values.root as string) : undefined,
      port: values.port ? Number(values.port) : undefined,
      host: values.host as string | undefined,
      authToken: values.token as string | undefined,
      tunnel: values.tunnel ? parseTunnel(values.tunnel as string) : undefined,
      ngrokHostname: values["ngrok-hostname"] as string | undefined,
      includePluginSkills: values["include-plugin-skills"] as boolean | undefined,
      noAuth: values["no-auth"] as boolean | undefined,
    });
    const result = await launch(config);
    printStartup(result, config);

    const shutdown = async () => {
      try {
        await result.handle.close();
        result.tunnelProcess?.kill();
      } catch {
        // ignore
      }
      process.exit(0);
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
    return;
  }

  if (subcommand === "execute-handoff") {
    const { values } = parseArgs({
      args: rest,
      options: {
        root: { type: "string" },
        agent: { type: "string", default: "codex" },
        model: { type: "string" },
        "reasoning-effort": { type: "string" },
        "dry-run": { type: "boolean" },
        yes: { type: "boolean" },
        command: { type: "string" },
      },
      strict: false,
    });
    const config = resolveConfig({ root: values.root ? resolvePath(values.root as string) : undefined });
    const ws = new Workspace(config);
    ensureContextFiles(ws, config.contextDir);
    const plan = readPlan(ws, config);
    if (isScaffoldPlan(plan)) die("No non-scaffold plan found in .cc-bridge/current-plan.md");
    const effort = values["reasoning-effort"] as Config["handoffReasoningEffort"] | undefined;
    try {
      const res = await executeHandoff(ws, config, {
        agent: values.agent as string,
        model: values.model as string | undefined,
        reasoningEffort: effort,
        dryRun: values["dry-run"] as boolean | undefined,
        yes: values.yes as boolean | undefined,
        commandOverride: values.command ? (values.command as string).split(/\s+/) : undefined,
      });
      console.log(`Command: ${res.command.join(" ")}`);
      console.log(`Exit: ${res.exitCode}${res.dryRun ? " (dry-run)" : ""}`);
      if (res.stdout) console.log(res.stdout);
      if (res.stderr) console.error(res.stderr);
      process.exit(res.exitCode);
    } catch (e) {
      die((e as Error).message);
    }
    return;
  }

  if (subcommand === "watch-handoff") {
    const { values } = parseArgs({
      args: rest,
      options: {
        root: { type: "string" },
        agent: { type: "string", default: "codex" },
        model: { type: "string" },
        "reasoning-effort": { type: "string" },
        once: { type: "boolean" },
        "dry-run": { type: "boolean" },
        yes: { type: "boolean" },
        command: { type: "string" },
      },
      strict: false,
    });
    const config = resolveConfig({ root: values.root ? resolvePath(values.root as string) : undefined });
    const ws = new Workspace(config);
    ensureContextFiles(ws, config.contextDir);
    const effort = values["reasoning-effort"] as Config["handoffReasoningEffort"] | undefined;
    await watchHandoff(
      ws,
      config,
      {
        agent: values.agent as string,
        model: values.model as string | undefined,
        reasoningEffort: effort,
        once: values.once as boolean | undefined,
        dryRun: values["dry-run"] as boolean | undefined,
        yes: values.yes as boolean | undefined,
        commandOverride: values.command ? (values.command as string).split(/\s+/) : undefined,
      },
      (msg) => console.error(`[watch] ${msg}`),
    );
    return;
  }

  die(`Unknown command: ${subcommand}. Run 'cc-bridge --help'.`);
}

function printHelp(): void {
  console.log(`cc-bridge — local MCP bridge for ChatGPT Developer Mode

Usage:
  cc-bridge start [options]
  cc-bridge execute-handoff [options]
  cc-bridge watch-handoff [options]

start options:
  --root <path>            Workspace root (default: cwd)
  --port <n>               HTTP port (default: 8787)
  --host <host>            Bind host (default: 127.0.0.1)
  --token <token>          Auth token (default: random UUID)
  --tunnel <mode>          none | cloudflare | ngrok (default: none)
  --ngrok-hostname <host>  Stable ngrok domain
  --no-auth                Disable token auth (local only; not allowed with tunnel)
  --include-plugin-skills  Include plugin cache skills

execute-handoff / watch-handoff options:
  --root <path>                 Workspace root
  --agent <name>                Agent name (default: codex)
  --model <model>               Override handoff model
  --reasoning-effort <level>    low | medium | high
  --command <cmd>               Override agent command (for testing)
  --dry-run                     Print command without executing
  --yes                         Skip confirmation (required in non-interactive shells)
  --once                        (watch only) Run once and exit
`);
}

main().catch((e) => die((e as Error).message));
