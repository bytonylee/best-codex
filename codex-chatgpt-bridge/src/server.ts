import { createServer, IncomingMessage } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Config } from "./config.js";
import { Workspace } from "./workspace.js";
import { createMcpServer, TOOL_NAMES } from "./tools.js";
import { renderCardWidget, WIDGET_URI } from "./widgets.js";

export interface ServerHandle {
  httpServer: ReturnType<typeof createServer>;
  url: () => string;
  setUrl: (u: string) => void;
  close: () => Promise<void>;
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolveP, rejectP) => {
    let data = "";
    req.on("data", (c) => (data += c.toString("utf8")));
    req.on("end", () => resolveP(data));
    req.on("error", rejectP);
  });
}

/** Extract bearer token from Authorization header or query param. */
function extractToken(req: IncomingMessage, config: Config): string | null {
  const auth = req.headers.authorization;
  if (auth && auth.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim();
  }
  const url = new URL(req.url ?? "/", "http://localhost");
  const q = url.searchParams.get(config.tokenQueryParam);
  if (q) return q;
  return null;
}

function authorized(req: IncomingMessage, config: Config): boolean {
  if (!config.requireAuth) return true;
  return extractToken(req, config) === config.authToken;
}

export function createBridgeServer(config: Config): ServerHandle {
  const ws = new Workspace(config);

  let currentUrl = `http://${config.host}:${config.port}/mcp`;
  const serverUrl = () => currentUrl;
  const setUrl = (u: string) => {
    currentUrl = u;
  };

  // Per-request transport: stateless mode for ChatGPT Apps compatibility.
  const httpServer = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

    // Health check (no auth).
    if (url.pathname === "/health" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", root: ws.root, tunnel: config.tunnel }));
      return;
    }

    // Local setup/status page (requires auth in tunnel mode, but readable locally).
    if (url.pathname === "/" && req.method === "GET") {
      if (!authorized(req, config)) {
        res.writeHead(401, { "Content-Type": "text/plain" });
        res.end("Unauthorized. Provide a bearer token or ?cc_bridge_token=.");
        return;
      }
      const html = renderCardWidget({ root: ws.root, serverUrl: currentUrl, tools: [...TOOL_NAMES] });
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
      return;
    }

    // MCP endpoint.
    if (url.pathname === "/mcp") {
      if (!authorized(req, config)) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Unauthorized" }));
        return;
      }
      // Stateless pattern: fresh server + transport per request.
      const mcp = createMcpServer({ config, ws, serverUrl });
      try {
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: undefined, // stateless
        });
        let parsedBody: unknown;
        if (req.method === "POST") {
          const raw = await readBody(req);
          parsedBody = raw ? JSON.parse(raw) : undefined;
        }
        await mcp.connect(transport);
        await transport.handleRequest(req, res, parsedBody);
        res.on("close", () => {
          transport.close().catch(() => {});
          mcp.close().catch(() => {});
        });
      } catch (e) {
        if (!res.headersSent) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: (e as Error).message }));
        }
        mcp.close().catch(() => {});
      }
      return;
    }

    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found. Use /mcp, /health, or /.");
  });

  return {
    httpServer,
    url: () => currentUrl,
    setUrl,
    close: async () => {
      httpServer.close();
    },
  };
}

export function startListening(handle: ServerHandle, config: Config): Promise<void> {
  return new Promise((resolveP, rejectP) => {
    handle.httpServer.on("error", rejectP);
    handle.httpServer.listen(config.port, config.host, () => resolveP());
  });
}

export function buildServerUrl(config: Config, tunnelUrl?: string): string {
  if (tunnelUrl) {
    const u = new URL(tunnelUrl);
    if (config.requireAuth) {
      u.searchParams.set(config.tokenQueryParam, config.authToken);
    }
    return u.toString();
  }
  const u = new URL(`http://${config.host}:${config.port}/mcp`);
  if (config.requireAuth) {
    u.searchParams.set(config.tokenQueryParam, config.authToken);
  }
  return u.toString();
}

export { WIDGET_URI };
