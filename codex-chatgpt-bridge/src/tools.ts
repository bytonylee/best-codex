import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Config } from "./config.js";
import { Workspace, WorkspaceError, redactSecrets } from "./workspace.js";
import * as fsops from "./fsops.js";
import * as bash from "./bash.js";
import { discoverSkills, findSkill, readSkillMarkdown, readSkillFile } from "./skills.js";
import { saveImage, isAllowedMime } from "./images.js";
import {
  writePlan,
  ensureContextFiles,
} from "./handoff.js";
import { renderCardWidget, renderSaveImageWidget, WIDGET_URI } from "./widgets.js";

export interface ToolContext {
  config: Config;
  ws: Workspace;
  serverUrl: () => string;
}

export const TOOL_NAMES = [
  "server_config",
  "open_workspace",
  "tree",
  "search",
  "read",
  "write",
  "edit",
  "bash",
  "git_status",
  "git_diff",
  "show_changes",
  "load_skill",
  "save_image_artifact",
  "render_save_image_widget",
  "handoff_to_codex",
  "read_handoff",
] as const;

/** Create a fresh McpServer with all tools registered (stateless pattern: one per request). */
export function createMcpServer(ctx: ToolContext): McpServer {
  const server = new McpServer(
    { name: "cc-bridge", version: "0.1.0" },
    { capabilities: { tools: {} } },
  );
  registerTools(server, ctx);
  return server;
}

const TOOL_INSTRUCTIONS = `CC Bridge tools. Workflow:
1. Call open_workspace once at the start.
2. Inspect with tree, search, and read.
3. Prefer edit for existing source files.
4. Use write only for new files or explicit full overwrites.
5. Prefer git_status, git_diff, and show_changes over bash for review.
6. Use bash only for verification commands (test/typecheck/lint/build) or bounded git inspection.
7. Call show_changes after edits or image saves.`;

function err(e: unknown): { isError: true; content: { type: "text"; text: string }[] } {
  const msg = e instanceof Error ? e.message : String(e);
  return { isError: true, content: [{ type: "text", text: `Error: ${msg}` }] };
}

function text(t: string): { content: { type: "text"; text: string }[] } {
  return { content: [{ type: "text", text: t }] };
}

export function registerTools(server: McpServer, ctx: ToolContext): void {
  const { config, ws } = ctx;

  // server_config
  server.registerTool(
    "server_config",
    {
      description: "Show CC Bridge root, modes, limits, auth/tunnel status, and blocked globs.",
      inputSchema: {},
    },
    async () => {
      const data = {
        root: ws.root,
        port: config.port,
        host: config.host,
        tunnel: config.tunnel,
        authRequired: config.requireAuth,
        tokenQueryParam: config.tokenQueryParam,
        limits: {
          maxReadBytes: config.maxReadBytes,
          maxTreeEntries: config.maxTreeEntries,
          maxSearchResults: config.maxSearchResults,
          maxBashOutputBytes: config.maxBashOutputBytes,
          bashTimeoutMs: config.bashTimeoutMs,
          maxImageBytes: config.maxImageBytes,
        },
        imageDir: config.imageDir,
        contextDir: config.contextDir,
        handoff: {
          model: config.handoffModel,
          reasoningEffort: config.handoffReasoningEffort,
        },
        blockedGlobs: config.blockedGlobs,
        instructions: TOOL_INSTRUCTIONS,
      };
      return text(JSON.stringify(data, null, 2));
    },
  );

  // open_workspace
  server.registerTool(
    "open_workspace",
    {
      description:
        "Open the configured single workspace. Returns AGENTS summary, skill inventory, git status, and optional tree.",
      inputSchema: { tree: z.boolean().optional().describe("Include a bounded top-level tree.") },
    },
    async ({ tree: includeTree }) => {
      const agentsPath = join(ws.root, "AGENTS.md");
      let agentsSummary = "";
      if (existsSync(agentsPath)) {
        const md = readFileSync(agentsPath, "utf8");
        agentsSummary = md.slice(0, 4000);
      }
      const skills = discoverSkills(ws, config.includePluginSkills).map((s) => ({
        name: s.name,
        description: s.description,
        source: s.source,
      }));
      let gitStatus = "";
      try {
        gitStatus = fsops.gitStatus(ws);
      } catch {
        gitStatus = "";
      }
      let treeEntries: unknown = null;
      if (includeTree) {
        treeEntries = fsops.tree(ws, ".", Math.min(200, config.maxTreeEntries)).slice(0, 200);
      }
      const data = {
        root: ws.root,
        agentsSummary,
        skills,
        gitStatus,
        tree: treeEntries,
        instructions: TOOL_INSTRUCTIONS,
      };
      return text(JSON.stringify(data, null, 2));
    },
  );

  // tree
  server.registerTool(
    "tree",
    {
      description: "Bounded workspace tree.",
      inputSchema: { path: z.string().optional().describe("Subdirectory relative to root. Defaults to root.") },
    },
    async ({ path }) => {
      try {
        const entries = fsops.tree(ws, path ?? ".", config.maxTreeEntries);
        return text(JSON.stringify(entries, null, 2));
      } catch (e) {
        return err(e);
      }
    },
  );

  // search
  server.registerTool(
    "search",
    {
      description: "Bounded workspace text search.",
      inputSchema: {
        query: z.string(),
        glob: z.string().optional(),
        ignoreCase: z.boolean().optional(),
      },
    },
    async ({ query, glob, ignoreCase }) => {
      try {
        const hits = fsops.search(ws, query, {
          maxResults: config.maxSearchResults,
          glob,
          ignoreCase,
        });
        return text(JSON.stringify(hits, null, 2));
      } catch (e) {
        return err(e);
      }
    },
  );

  // read
  server.registerTool(
    "read",
    {
      description: "Bounded text read with line numbers. Secret-looking values are redacted.",
      inputSchema: {
        path: z.string(),
        startLine: z.number().int().optional(),
        endLine: z.number().int().optional(),
      },
    },
    async ({ path, startLine, endLine }) => {
      try {
        const res = fsops.readFile(ws, path, {
          maxBytes: config.maxReadBytes,
          startLine,
          endLine,
        });
        return text(res.content);
      } catch (e) {
        return err(e);
      }
    },
  );

  // write
  server.registerTool(
    "write",
    {
      description: "Create a new file by default; overwrite only when overwrite:true. Rejects secret-looking literals.",
      inputSchema: {
        path: z.string(),
        content: z.string(),
        overwrite: z.boolean().optional(),
      },
    },
    async ({ path, content, overwrite }) => {
      try {
        const res = fsops.writeFile(ws, path, content, { overwrite });
        return text(JSON.stringify(res, null, 2));
      } catch (e) {
        return err(e);
      }
    },
  );

  // edit
  server.registerTool(
    "edit",
    {
      description: "Exact text replacement; preferred for existing source changes.",
      inputSchema: {
        path: z.string(),
        old_text: z.string(),
        new_text: z.string(),
        replace_all: z.boolean().optional(),
      },
    },
    async ({ path, old_text, new_text, replace_all }) => {
      try {
        const res = fsops.editFile(ws, path, old_text, new_text, { replaceAll: replace_all });
        return text(JSON.stringify(res, null, 2));
      } catch (e) {
        return err(e);
      }
    },
  );

  // bash
  server.registerTool(
    "bash",
    {
      description:
        "Safe allowlist for verification commands (test/typecheck/lint/build) and bounded git inspection. No pipes, redirection, or destructive commands.",
      inputSchema: { command: z.string() },
    },
    async ({ command }) => {
      try {
        const res = await bash.run(command, config, ws.root);
        const out = `$ ${command}\n[exit ${res.exitCode}]${res.truncated ? " [truncated]" : ""}\n--- stdout ---\n${res.stdout}\n--- stderr ---\n${res.stderr}`;
        return text(out);
      } catch (e) {
        return err(e);
      }
    },
  );

  // git_status
  server.registerTool(
    "git_status",
    { description: "Structured git status (porcelain v1).", inputSchema: {} },
    async () => text(fsops.gitStatus(ws)),
  );

  // git_diff
  server.registerTool(
    "git_diff",
    {
      description: "Structured bounded git diff.",
      inputSchema: { args: z.array(z.string()).optional() },
    },
    async ({ args }) => text(fsops.gitDiff(ws, args ?? [])),
  );

  // show_changes
  server.registerTool(
    "show_changes",
    { description: "Review-oriented status and diff summary.", inputSchema: {} },
    async () => {
      const c = fsops.showChanges(ws);
      return text(`--- status ---\n${c.status}\n--- diff (stat) ---\n${c.diff}`);
    },
  );

  // load_skill
  server.registerTool(
    "load_skill",
    {
      description: "Explicit skill loading from discovered inventory.",
      inputSchema: {
        name: z.string(),
        file: z.string().optional().describe("Optional bounded read of a file under the skill directory."),
      },
    },
    async ({ name, file }) => {
      try {
        const skills = discoverSkills(ws, config.includePluginSkills);
        const skill = findSkill(skills, name);
        if (!skill) return err(new Error(`Skill not found: ${name}`));
        if (file) {
          return text(readSkillFile(skill, file, config.maxReadBytes));
        }
        return text(readSkillMarkdown(skill));
      } catch (e) {
        return err(e);
      }
    },
  );

  // save_image_artifact
  server.registerTool(
    "save_image_artifact",
    {
      description:
        "Save a ChatGPT-generated image into the workspace. Accepts base64 (universal fallback). Sniffs signatures to verify MIME. Defaults to assets/generated/<slug>-<timestamp>-<hash>.<ext>.",
      inputSchema: {
        base64: z.string().optional(),
        mimeType: z.string(),
        outputPath: z.string().optional(),
        overwrite: z.boolean().optional(),
        slug: z.string().optional(),
      },
    },
    async ({ base64, mimeType, outputPath, overwrite, slug }) => {
      try {
        if (!isAllowedMime(mimeType)) {
          return err(new Error(`MIME type not allowed: ${mimeType}`));
        }
        const res = saveImage(ws, { base64, mimeType, outputPath, overwrite, slug }, config.maxImageBytes, config.imageDir);
        return text(JSON.stringify(res, null, 2));
      } catch (e) {
        return err(e);
      }
    },
  );

  // render_save_image_widget
  server.registerTool(
    "render_save_image_widget",
    {
      description:
        "Show a ChatGPT Apps fallback UI for selecting or uploading an image artifact when automatic artifact handles are not exposed.",
      inputSchema: {},
    },
    async () => {
      const html = renderSaveImageWidget({ serverUrl: ctx.serverUrl() });
      return text(`${WIDGET_URI}\n\n${html}`);
    },
  );

  // handoff_to_codex
  server.registerTool(
    "handoff_to_codex",
    {
      description:
        "Write a Codex handoff plan to .cc-bridge/current-plan.md. Never executes Codex. Ensures context files exist and appends a JSONL event.",
      inputSchema: { plan: z.string() },
    },
    async ({ plan }) => {
      try {
        ensureContextFiles(ws, config.contextDir);
        const res = writePlan(ws, config, plan);
        return text(JSON.stringify({ written: true, hash: res.hash, path: `${config.contextDir}/current-plan.md` }, null, 2));
      } catch (e) {
        return err(e);
      }
    },
  );

  // read_handoff
  server.registerTool(
    "read_handoff",
    {
      description: "Read .cc-bridge plan/status/diff/log files.",
      inputSchema: {
        file: z.enum([
          "current-plan.md",
          "agent-status.md",
          "codex-status.md",
          "implementation-diff.patch",
          "execution-log.jsonl",
          "decisions.md",
          "open-questions.md",
        ]),
      },
    },
    async ({ file }) => {
      try {
        const p = join(ws.root, config.contextDir, file);
        if (!existsSync(p)) return text(`(empty) ${file}`);
        const content = readFileSync(p, "utf8");
        return text(redactSecrets(content));
      } catch (e) {
        return err(e);
      }
    },
  );
}

export { WorkspaceError, renderCardWidget, WIDGET_URI };
