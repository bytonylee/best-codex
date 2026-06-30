import { spawn, ChildProcess } from "node:child_process";
import { execSync } from "node:child_process";
import type { Config } from "./config.js";
import { createBridgeServer, startListening, buildServerUrl, ServerHandle } from "./server.js";

export interface LaunchResult {
  handle: ServerHandle;
  serverUrl: string;
  tunnelProcess?: ChildProcess;
  tunnelUrl?: string;
}

function binaryAvailable(name: string): boolean {
  try {
    execSync(`command -v ${name}`, { stdio: ["ignore", "ignore", "ignore"] });
    return true;
  } catch {
    return false;
  }
}

export async function launch(config: Config): Promise<LaunchResult> {
  const handle = createBridgeServer(config);
  await startListening(handle, config);

  let tunnelProcess: ChildProcess | undefined;
  let tunnelUrl: string | undefined;

  if (config.tunnel === "cloudflare") {
    if (!binaryAvailable("cloudflared")) {
      throw new Error("cloudflared not installed. Install it to use --tunnel cloudflare.");
    }
    tunnelProcess = spawn(
      "cloudflared",
      ["tunnel", "--url", `http://${config.host}:${config.port}`],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    tunnelUrl = await waitForTunnelUrl(tunnelProcess, "trycloudflare.com");
  } else if (config.tunnel === "ngrok") {
    if (!binaryAvailable("ngrok")) {
      throw new Error("ngrok not installed. Install it to use --tunnel ngrok.");
    }
    const ngrokArgs = [
      "http",
      `${config.host}:${config.port}`,
    ];
    if (config.ngrokHostname) {
      ngrokArgs.push("--domain", config.ngrokHostname);
    }
    tunnelProcess = spawn("ngrok", ngrokArgs, { stdio: ["ignore", "pipe", "pipe"] });
    tunnelUrl = await waitForNgrokUrl();
  }

  const serverUrl = buildServerUrl(config, tunnelUrl);
  handle.setUrl(serverUrl);

  return { handle, serverUrl, tunnelProcess, tunnelUrl };
}

function waitForTunnelUrl(proc: ChildProcess, domainHint: string): Promise<string> {
  return new Promise((resolveP, rejectP) => {
    const timer = setTimeout(() => {
      rejectP(new Error("Timed out waiting for tunnel URL."));
    }, 30_000);
    const onData = (d: Buffer) => {
      const text = d.toString("utf8");
      const m = text.match(/https:\/\/[a-z0-9-]+\.(?:trycloudflare\.com|ngrok\.app|ngrok-free\.app)/i);
      if (m && m[0]!.includes(domainHint)) {
        clearTimeout(timer);
        proc.stdout?.off("data", onData);
        resolveP(m[0]!);
      }
    };
    proc.stdout?.on("data", onData);
    proc.on("error", (e) => {
      clearTimeout(timer);
      rejectP(e);
    });
  });
}

function waitForNgrokUrl(): Promise<string> {
  // ngrok doesn't print the URL to stdout reliably; query the API.
  return new Promise(async (resolveP, rejectP) => {
    const timer = setTimeout(() => rejectP(new Error("Timed out waiting for ngrok URL.")), 30_000);
    const tries = 60;
    for (let i = 0; i < tries; i++) {
      await new Promise((r) => setTimeout(r, 500));
      try {
        const resp = await fetch("http://127.0.0.1:4040/api/tunnels");
        if (!resp.ok) continue;
        const json = (await resp.json()) as { tunnels: { public_url: string }[] };
        const url = json.tunnels?.[0]?.public_url;
        if (url) {
          clearTimeout(timer);
          resolveP(url);
          return;
        }
      } catch {
        // keep trying
      }
    }
    clearTimeout(timer);
    rejectP(new Error("Could not determine ngrok URL."));
  });
}

export function printStartup(result: LaunchResult, config: Config): void {
  const { serverUrl, tunnelUrl } = result;
  console.error(`\nCC Bridge is running.`);
  console.error(`  Workspace: ${config.root}`);
  console.error(`  Local:     http://${config.host}:${config.port}`);
  if (tunnelUrl) console.error(`  Tunnel:    ${tunnelUrl}`);
  console.error(`  MCP URL:   ${serverUrl}`);
  if (config.requireAuth) {
    console.error(`\n  WARNING: the MCP URL contains a secret token. Do not share it publicly.`);
  }
  console.error("");
}
