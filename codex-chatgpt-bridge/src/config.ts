import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { resolve } from "node:path";

export type TunnelMode = "none" | "cloudflare" | "ngrok";

export interface Config {
  root: string;
  port: number;
  host: string;
  authToken: string;
  tokenQueryParam: string;
  tunnel: TunnelMode;
  ngrokHostname?: string;
  maxReadBytes: number;
  maxTreeEntries: number;
  maxSearchResults: number;
  maxBashOutputBytes: number;
  bashTimeoutMs: number;
  maxImageBytes: number;
  imageDir: string;
  contextDir: string;
  handoffModel: string;
  handoffReasoningEffort: "low" | "medium" | "high";
  handoffAgentCommand?: string;
  includePluginSkills: boolean;
  blockedGlobs: string[];
  requireAuth: boolean;
}

export const DEFAULT_BLOCKED_GLOBS = [
  "**/.git/**",
  "**/.git",
  "**/.env",
  "**/.env.*",
  "**/*.pem",
  "**/*.key",
  "**/*.p12",
  "**/*.pfx",
  "**/.ssh/**",
  "**/.aws/**",
  "**/.codex/auth.json",
  "**/.codex/auth*.json",
  "**/node_modules/**",
  "**/dist/**",
  "**/build/**",
  "**/.cache/**",
  "**/coverage/**",
  "**/.next/**",
  "**/.turbo/**",
  "**/.DS_Store",
];

export const DEFAULTS = {
  port: 8787,
  host: "127.0.0.1",
  maxReadBytes: 256 * 1024,
  maxTreeEntries: 2000,
  maxSearchResults: 200,
  maxBashOutputBytes: 256 * 1024,
  bashTimeoutMs: 60_000,
  maxImageBytes: 25 * 1024 * 1024,
  imageDir: "assets/generated",
  contextDir: ".cc-bridge",
  handoffModel: "gpt-5.4-mini",
  handoffReasoningEffort: "medium" as const,
  tokenQueryParam: "cc_bridge_token",
};

export interface RawArgs {
  root?: string;
  port?: number;
  host?: string;
  authToken?: string;
  tunnel?: TunnelMode;
  ngrokHostname?: string;
  handoffModel?: string;
  handoffReasoningEffort?: "low" | "medium" | "high";
  handoffAgentCommand?: string;
  includePluginSkills?: boolean;
  noAuth?: boolean;
}

function parseEnv(): Partial<RawArgs> {
  const env = process.env;
  const out: Partial<RawArgs> = {};
  if (env.CC_BRIDGE_ROOT) out.root = env.CC_BRIDGE_ROOT;
  if (env.CC_BRIDGE_PORT) out.port = Number(env.CC_BRIDGE_PORT);
  if (env.CC_BRIDGE_HOST) out.host = env.CC_BRIDGE_HOST;
  if (env.CC_BRIDGE_TOKEN) out.authToken = env.CC_BRIDGE_TOKEN;
  if (env.CC_BRIDGE_TUNNEL) out.tunnel = env.CC_BRIDGE_TUNNEL as TunnelMode;
  if (env.CC_BRIDGE_NGROK_HOSTNAME) out.ngrokHostname = env.CC_BRIDGE_NGROK_HOSTNAME;
  if (env.CC_BRIDGE_HANDOFF_MODEL) out.handoffModel = env.CC_BRIDGE_HANDOFF_MODEL;
  if (env.CC_BRIDGE_HANDOFF_REASONING)
    out.handoffReasoningEffort = env.CC_BRIDGE_HANDOFF_REASONING as "low" | "medium" | "high";
  if (env.CC_BRIDGE_HANDOFF_COMMAND) out.handoffAgentCommand = env.CC_BRIDGE_HANDOFF_COMMAND;
  if (env.CC_BRIDGE_INCLUDE_PLUGIN_SKILLS) out.includePluginSkills = true;
  return out;
}

export function resolveConfig(input: Partial<RawArgs> = {}): Config {
  const env = parseEnv();
  const merged: RawArgs = { ...env, ...input };

  const root = resolve(merged.root ?? process.cwd());
  const tunnel = merged.tunnel ?? "none";
  const requireAuth = !merged.noAuth;

  // Tunnel mode always requires auth.
  if (tunnel !== "none" && !requireAuth) {
    throw new Error("Tunnel mode always requires token auth; cannot use --no-auth with a tunnel.");
  }

  const authToken =
    merged.authToken ??
    process.env.CC_BRIDGE_TOKEN ??
    randomUUID();

  return {
    root,
    port: merged.port ?? DEFAULTS.port,
    host: merged.host ?? DEFAULTS.host,
    authToken,
    tokenQueryParam: DEFAULTS.tokenQueryParam,
    tunnel,
    ngrokHostname: merged.ngrokHostname,
    maxReadBytes: DEFAULTS.maxReadBytes,
    maxTreeEntries: DEFAULTS.maxTreeEntries,
    maxSearchResults: DEFAULTS.maxSearchResults,
    maxBashOutputBytes: DEFAULTS.maxBashOutputBytes,
    bashTimeoutMs: DEFAULTS.bashTimeoutMs,
    maxImageBytes: DEFAULTS.maxImageBytes,
    imageDir: DEFAULTS.imageDir,
    contextDir: DEFAULTS.contextDir,
    handoffModel: merged.handoffModel ?? DEFAULTS.handoffModel,
    handoffReasoningEffort: merged.handoffReasoningEffort ?? DEFAULTS.handoffReasoningEffort,
    handoffAgentCommand: merged.handoffAgentCommand,
    includePluginSkills: merged.includePluginSkills ?? false,
    blockedGlobs: DEFAULT_BLOCKED_GLOBS,
    requireAuth,
  };
}

export function userHome(): string {
  return homedir();
}
