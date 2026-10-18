import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { type Context, Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { recordAgentConnection } from "../../slices/agents/connection.js";
import { viaProxy } from "../http/same-page.js";
import { measuredOnce } from "./file-tools.js";
import { createMcpServer, type McpDeps } from "./server.js";

export interface McpRouteDeps extends McpDeps {
  // The address the server listens on; a page served from it is the app's own.
  readonly host?: string | undefined;
}

export const agentsLocalOnly =
  "Slopify refused this MCP request because it came through Tailscale or another proxy. Agents connect only on the computer Slopify runs on, at http://127.0.0.1:<port>/mcp; remote access in Settings → General is for the Slopify page alone.";

const loopback = new Set(["localhost", "127.0.0.1", "[::1]"]);
const wildcard = new Set(["", "0.0.0.0", "::"]);
// ceiling: a Studio export (30 MB, `http/studio.ts`) sent as base64 is about 40 MB; nothing an
// agent sends is bigger. The transport's own 4 MiB bound does not apply to a parsed body.
const mcpBodyMax = 48 * 1024 * 1024;

// A browser always sends Origin, so a web page at another address (DNS rebinding included,
// which needs the attacker's own hostname) is refused; a CLI agent sends none. The port is
// not compared: inside Docker the published port is not known to the app.
export function originAllowed(origin: string | undefined, host: string | undefined): boolean {
  if (origin === undefined) return true;
  let hostname: string;
  try {
    hostname = new URL(origin).hostname;
  } catch {
    return false;
  }
  if (loopback.has(hostname) || hostname.endsWith(".localhost")) return true;
  if (host === undefined || wildcard.has(host)) return false;
  return hostname === (host.includes(":") ? `[${host}]` : host);
}

function rpcError(c: Context, status: ContentfulStatusCode, message: string): Response {
  return c.json({ jsonrpc: "2.0", error: { code: -32000, message }, id: null }, status);
}

function initializes(body: unknown): boolean {
  const messages = Array.isArray(body) ? body : [body];
  return messages.some(
    (message) =>
      typeof message === "object" &&
      message !== null &&
      "method" in message &&
      message.method === "initialize",
  );
}

export function mcpRoutes(routeDeps: McpRouteDeps): Hono {
  const { measureAudio } = routeDeps;
  const deps: McpRouteDeps =
    measureAudio === undefined
      ? routeDeps
      : { ...routeDeps, measureAudio: measuredOnce((path) => measureAudio(path)) };
  return (
    new Hono()
      // Agents run on this computer: an agent reaching Slopify through Tailscale serve (or any
      // other proxy) would act with the person's keys from another device.
      .use("*", async (c, next) => {
        if (!viaProxy(c.req.raw.headers)) return next();
        return rpcError(c, 403, agentsLocalOnly);
      })
      .use("*", async (c, next) => {
        if (originAllowed(c.req.header("origin"), deps.host)) return next();
        return rpcError(
          c,
          403,
          "Slopify refused this MCP request because it came from a web page at another address. Agents connect from the command line with no Origin; the setup lines are in Settings → Connections → Agents (MCP).",
        );
      })
      .post(
        "/",
        bodyLimit({
          maxSize: mcpBodyMax,
          onError: (c) =>
            rpcError(
              c,
              413,
              "Slopify refused this MCP request: it is larger than 48 MB, more than any file Slopify takes. Send a smaller file.",
            ),
        }),
        async (c) => {
          let body: unknown;
          try {
            body = await c.req.json();
          } catch {
            return rpcError(
              c,
              400,
              "Slopify couldn't read this MCP request: its body is not JSON. Send one JSON-RPC message.",
            );
          }
          if (initializes(body)) recordAgentConnection(deps.db, deps.clock.now().toISOString());
          const server = createMcpServer(deps);
          // No sessionIdGenerator: stateless, one transport per request.
          const transport = new WebStandardStreamableHTTPServerTransport({
            enableJsonResponse: true,
          });
          await server.connect(transport);
          try {
            return await transport.handleRequest(c.req.raw, { parsedBody: body });
          } finally {
            await server.close();
          }
        },
      )
      .on(["GET", "DELETE"], "/", (c) =>
        rpcError(
          c,
          405,
          "Slopify's MCP endpoint keeps no session and no event stream: send each request as a POST.",
        ),
      )
  );
}
