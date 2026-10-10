import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { needsAttention } from "../../slices/agents/attention.js";
import type { RevisionDeps } from "../../slices/revisions/model.js";
import { callRoute, type RouteCallDeps, text } from "./call-route.js";
import { registerFileTools } from "./file-tools.js";
import { attendRoutine, serverInstructions } from "./instructions.js";
import { registerLibraryTools } from "./library-tools.js";
import { registerRemakeTools } from "./remake-tools.js";
import { registerReviewTools } from "./review-tools.js";
import { inputShape, type RouteTool, routeOf } from "./route-tool.js";
import { routeTools } from "./tools.js";

export interface McpDeps extends RouteCallDeps, RevisionDeps {
  readonly version: string;
}

const argsSchema = z.record(z.string(), z.unknown());

// ceiling: one server per request, so every POST registers every tool again (a few hundred
// small objects). A session cache is the upgrade if tools/list ever shows in a profile.
export function createMcpServer(deps: McpDeps): McpServer {
  const server = new McpServer(
    { name: "slopify", version: deps.version },
    { instructions: serverInstructions },
  );
  for (const tool of routeTools) registerRouteTool(server, deps, tool);
  registerFileTools(server, deps);
  registerReviewTools(server, deps);
  registerLibraryTools(server, deps);
  registerRemakeTools(server, deps);
  server.registerTool(
    "needs_attention",
    {
      title: "What needs attention",
      description:
        "Everything waiting for someone, oldest first: external reviews waiting for a verdict, flagged review verdicts, review checkpoints waiting for approval, failed steps, paused runs, held topics, videos marked Late · upload now and the extension's failed finishing touches. Each entry has its kind, the project (or schedule), stage and item, the reason or error text, autoRetryInFlight (skip it while true), agentCanAct (report it when false), the fixing tools' ids and the tools to use.",
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    () =>
      text(
        JSON.stringify({
          entries: needsAttention({ db: deps.db, paths: deps.paths }, deps.clock.now()),
        }),
      ),
  );
  server.registerPrompt(
    "attend",
    {
      title: "Attend to Slopify",
      description: "The routine that clears what waits for a person; run it on a schedule.",
    },
    () => ({ messages: [{ role: "user", content: { type: "text", text: attendRoutine } }] }),
  );
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
