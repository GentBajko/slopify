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
  registerAttention(server, deps);
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

export function registerAttention(server: McpServer, deps: McpDeps): void {
  server.registerTool(
    "needs_attention",
    {
      title: "What needs attention",
      description:
        "Everything waiting for someone, oldest first: external reviews waiting for a verdict, flagged review verdicts, review checkpoints waiting for approval, failed steps, paused runs, runs a restart stopped, held topics, videos marked Late · upload now, the extension's failed finishing touches and fills, posts filled in another site's form waiting for the person's Post, and schedules that skip their runs because their template has no version approved for schedules. Each entry has its kind, the project (or schedule), stage and item, the reason or error text, autoRetryInFlight (skip it while true), agentCanAct (report it when false), the fixing tools' ids and the tools to use.",
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    () =>
      text(
        JSON.stringify({
          entries: needsAttention(
            { db: deps.db, paths: deps.paths, log: deps.log },
            deps.clock.now(),
          ),
        }),
      ),
  );
}

export function registerRouteTool(
  server: McpServer,
  deps: McpDeps,
  tool: RouteTool,
  // The assistant's ask-first tools take confirmed: true with this meaning.
  confirmed?: string,
): void {
  const { method } = routeOf(tool);
  server.registerTool(
    tool.name,
    {
      title: tool.title,
      description: tool.description,
      inputSchema: confirmed === undefined ? inputShape(tool) : inputShape(tool, confirmed),
      annotations: {
        readOnlyHint: method === "GET" || (tool.unrecorded === true && tool.reachesOut !== "sends"),
        destructiveHint: method === "DELETE" || tool.confirm !== undefined,
        openWorldHint: tool.reachesOut !== undefined,
      },
    },
    (args) => callRoute(deps, tool, argsSchema.parse(args)),
  );
}
