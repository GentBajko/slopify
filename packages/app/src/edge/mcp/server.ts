import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { RevisionDeps } from "../../slices/revisions/model.js";
import { callRoute, type RouteCallDeps } from "./call-route.js";
import { registerFileTools } from "./file-tools.js";
import { inputShape, type RouteTool, routeOf } from "./route-tool.js";
import { routeTools } from "./tools.js";

export interface McpDeps extends RouteCallDeps, RevisionDeps {
  readonly version: string;
}

const argsSchema = z.record(z.string(), z.unknown());

// ceiling: one server per request, so every POST registers every tool again (a few hundred
// small objects). A session cache is the upgrade if tools/list ever shows in a profile.
export function createMcpServer(deps: McpDeps): McpServer {
  const server = new McpServer({ name: "slopify", version: deps.version });
  for (const tool of routeTools) registerRouteTool(server, deps, tool);
  registerFileTools(server, deps);
  return server;
}

function registerRouteTool(server: McpServer, deps: McpDeps, tool: RouteTool): void {
  const { method } = routeOf(tool);
  server.registerTool(
    tool.name,
    {
      title: tool.title,
      description: tool.description,
      inputSchema: inputShape(tool),
      annotations: {
        readOnlyHint: method === "GET",
        destructiveHint: method === "DELETE" || tool.confirm !== undefined,
        openWorldHint: false,
      },
    },
    (args) => callRoute(deps, tool, argsSchema.parse(args)),
  );
}
