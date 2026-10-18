import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { type Context, Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { z } from "zod";
import { redact } from "../../kernel/log.js";
import type {
  AllowedCall,
  AssistantTurnAccess,
  AssistantTurnTokens,
} from "../../slices/assistant/access.js";
import { consumeGrant } from "../../slices/assistant/asks.js";
import {
  costSentence,
  estimateOfAnswer,
  scheduleSentence,
  unpricedSentence,
} from "../../slices/assistant/cost.js";
import {
  argsHash,
  assistantExcludedTools,
  isGated,
  isOutward,
} from "../../slices/assistant/gate.js";
import { projectTitle } from "../../slices/assistant/names.js";
import { screenBlock } from "../../slices/assistant/prompt.js";
import { viaProxy } from "../http/same-page.js";
import { subjectsOf } from "./attribution.js";
import {
  callApi,
  callRoute,
  confirmText,
  type RouteCallDeps,
  refusal,
  text,
} from "./call-route.js";
import { registerFileTools } from "./file-tools.js";
import { agentsLocalOnly, originAllowed } from "./http.js";
import { registerRemakeTools } from "./remake-tools.js";
import { type RouteTool, routeOf } from "./route-tool.js";
import { type McpDeps, registerAttention, registerRouteTool } from "./server.js";
import { routeTools } from "./tools.js";

// The in-app assistant's own MCP endpoint. The same route tools as `/mcp`, minus the ones it
// is never offered, with "ask first" on removals, confirmed steps and paid work, and three
// tools of its own: the wiki and the screen the person has open. Each call is recorded as the
// assistant's. Only a running turn's token opens it.

export const assistantMcpPath = "/mcp/assistant";

// The route tools the assistant is offered: none that take a file from disk either.
export const assistantRouteTools: readonly RouteTool[] = routeTools.filter(
  (tool) => !assistantExcludedTools.has(tool.name) && tool.upload === undefined,
);

export const assistantInstructions =
  "Slopify's in-app assistant tools. Every tool does what the matching button in Slopify does, with the same checks, costs and refusals, and what you change is shown as \"by assistant\". Read how Slopify works with search_wiki and read_wiki, and what the person has open with current_screen. Work that costs money or removes something waits for the person's Allow: such a tool answers that it is waiting; stop then and tell them.";

const askedConfirmed =
  "Leave it out. Send true only when the latest message says the person allowed this exact call; on its own it does nothing.";

function waiting(tool: RouteTool, shown: string): CallToolResult {
  return refusal(
    `Waiting for the person: Slopify showed them «${shown}» with Allow and Don't. Stop and tell them; if they allow, Slopify makes this ${tool.name} call itself and tells you what it answered.`,
  );
}

const startedFrom: Readonly<Record<string, string>> = {
  start_rebuild: "previewId",
  start_draft: "reviewId",
};
const startBody = z.record(z.string(), z.unknown());

// What the card says: the step, what it is about, and what it costs or removes, in the page's
// own words where the page has them.
async function askText(
  deps: RouteCallDeps,
  tool: RouteTool,
  args: Readonly<Record<string, unknown>>,
  turn: AssistantTurnAccess,
): Promise<string> {
  const [projectId] = subjectsOf(tool, args, undefined).projectIds;
  const title = projectTitle(deps.db, projectId);
  const what = `${tool.title}${title === undefined ? "" : ` for “${title}”`}.`;
  const field = startedFrom[tool.name];
  const body = startBody.safeParse(args.body);
  const named = field === undefined || !body.success ? undefined : body.data[field];
  const costs = typeof named === "string" ? turn.costOf(named) : undefined;
  const consequence =
    (await confirmText(deps, tool, args)) ??
    tool.confirm ??
    (costs !== undefined
      ? costSentence(costs)
      : routeOf(tool).method === "DELETE"
        ? "This deletes it."
        : isOutward(gateOf(tool))
          ? "This sends to, or changes, an address outside Slopify."
          : (scheduleSentence(tool.name) ?? unpricedSentence));
  const details = detailsOf(args);
  return `${what} ${consequence}${details === "" ? "" : ` ${details}`}`;
}

// What the call carries, so the card shows what Allow lets go ahead: names, addresses,
// numbers and how many of each list, never an id (the card names the project instead), a
// retry key or anything that looks like a secret.
const hiddenField = /(^id$|Id$|Ids$|^idempotencyKey$|^fingerprint$|^confirmed$)/;
const secretField = /key|token|secret|password|authorization/i;
const detailsMax = 400;
// Weekday numbers as a schedule's weekly cadence counts them: 0 is Sunday.
const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
// A short list of plain values shown as they are; anything longer or nested stays a count.
function shortList(name: string, value: readonly unknown[]): string | undefined {
  if (value.length === 0 || value.length > 7) return undefined;
  const words = value.map((one) => {
    if (typeof one === "number" && name.endsWith("cadence.days"))
      return weekdays[one] ?? String(one);
    if (typeof one === "number" || typeof one === "boolean") return String(one);
    if (typeof one === "string") {
      const text = redact(one.replace(/\s+/g, " ").trim());
      return text === "" ? undefined : `“${text}”`;
    }
    return undefined;
  });
  if (words.some((one) => one === undefined)) return undefined;
  const joined = words.join(", ");
  return joined.length > 80 ? undefined : `${name}: ${joined}`;
}
function detailsOf(args: Readonly<Record<string, unknown>>): string {
  const parts: string[] = [];
  const add = (name: string, value: unknown, depth: number): void => {
    if (hiddenField.test(name) || value === undefined || value === null) return;
    if (secretField.test(name)) {
      parts.push(`${name}: (hidden)`);
      return;
    }
    if (typeof value === "string") {
      const shown = redact(value.replace(/\s+/g, " ").trim());
      if (shown !== "")
        parts.push(`${name}: “${shown.length > 80 ? `${shown.slice(0, 79)}…` : shown}”`);
    } else if (typeof value === "number" || typeof value === "boolean")
      parts.push(`${name}: ${String(value)}`);
    else if (Array.isArray(value)) {
      const shown = shortList(name, value);
      parts.push(
        shown ?? `${name}: ${String(value.length)} ${value.length === 1 ? "item" : "items"}`,
      );
    } else if (typeof value === "object" && depth < 2)
      for (const [key, inner] of Object.entries(value)) add(`${name}.${key}`, inner, depth + 1);
  };
  const { body, query, ...rest } = args;
  for (const [key, value] of Object.entries(rest)) add(key, value, 1);
  for (const source of [body, query])
    if (typeof source === "object" && source !== null && !Array.isArray(source))
      for (const [key, value] of Object.entries(source)) add(key, value, 1);
  if (parts.length === 0) return "";
  const line = `With ${parts.join(", ")}.`;
  return line.length > detailsMax ? `${line.slice(0, detailsMax - 1)}…` : line;
}

function gateOf(tool: RouteTool) {
  return {
    name: tool.name,
    method: routeOf(tool).method,
    confirm: tool.confirm,
    sends: tool.reachesOut === "sends",
  };
}

function gateFor(
  deps: RouteCallDeps,
  turn: AssistantTurnAccess,
): NonNullable<RouteCallDeps["gate"]> {
  return async (tool, args) => {
    if (!isGated(gateOf(tool))) return undefined;
    const hash = argsHash(args);
    if (args.confirmed === true && turn.grant({ tool: tool.name, argsHash: hash }))
      return undefined;
    const ask = turn.ask({
      tool: tool.name,
      argsHash: hash,
      text: await askText(deps, tool, args, turn),
      args,
    });
    return waiting(tool, ask.text);
  };
}

// The estimate each preview and review answers, kept for the start call that names it.
const priced = /^\/api\/(?:projects\/[^/]+\/rebuild\/preview|drafts\/[^/]+\/review)\/?$/;
function remembering(api: RouteCallDeps["api"], turn: AssistantTurnAccess): RouteCallDeps["api"] {
  return async (request) => {
    const response = await api(request);
    if (request.method !== "POST" || !response.ok || !priced.test(new URL(request.url).pathname))
      return response;
    try {
      const found = estimateOfAnswer(await response.clone().json());
      if (found !== undefined) turn.rememberCost(found.id, found.estimates);
    } catch {
      // An answer that isn't the estimate leaves the card with its plain sentence.
    }
    return response;
  };
}

// Allow pressed: the asked call made by Slopify, as the assistant, using the person's Allow
// once. Refused when that Allow is gone (used, expired) or the tool is not the assistant's.
export async function runAllowedCall(
  deps: RouteCallDeps,
  call: AllowedCall,
): Promise<{ readonly ok: boolean; readonly text: string }> {
  const tool = assistantRouteTools.find((one) => one.name === call.tool);
  if (tool === undefined || !isGated(gateOf(tool)))
    return {
      ok: false,
      text: `Slopify didn't make this step: ${call.tool} isn't one the assistant asks for. Ask the assistant again.`,
    };
  const args = { ...call.args, confirmed: true };
  const result = await callRoute(
    {
      ...deps,
      actor: "assistant",
      gate: async () =>
        consumeGrant(
          deps.db,
          { sessionId: call.sessionId, tool: tool.name, argsHash: argsHash(args) },
          deps.clock.now(),
        )
          ? undefined
          : refusal(
              "This Allow was already used or has expired, so Slopify didn't make the step again. Ask the assistant again if it is still needed.",
            ),
    },
    tool,
    args,
  );
  const said = result.content
    .flatMap((part) => (part.type === "text" ? [part.text] : []))
    .join("\n");
  return { ok: result.isError !== true, text: said };
}

export function createAssistantMcpServer(deps: McpDeps, turn: AssistantTurnAccess): McpServer {
  const server = new McpServer(
    { name: "slopify", version: deps.version },
    { instructions: assistantInstructions },
  );
  const own: McpDeps = { ...deps, actor: "assistant", api: remembering(deps.api, turn) };
  const gated: McpDeps = { ...own, gate: gateFor(own, turn) };
  for (const tool of assistantRouteTools)
    registerRouteTool(server, gated, tool, isGated(gateOf(tool)) ? askedConfirmed : undefined);
  registerFileTools(server, own);
  registerRemakeTools(server, own);
  registerAttention(server, own);
  registerGuideTools(server, own, turn);
  return server;
}

const wikiHit = z.object({ hits: z.array(z.unknown()) }).loose();

function registerGuideTools(server: McpServer, deps: McpDeps, turn: AssistantTurnAccess): void {
  server.registerTool(
    "search_wiki",
    {
      title: "Search the guide",
      description:
        "Searches Slopify's own guide (Help → Tutorials) for how something works. Answers each matching page's id, title, heading and a short excerpt; read a page with read_wiki.",
      inputSchema: { query: z.string().min(1).max(200) },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ query }) => {
      const answer = await callApi(
        deps,
        { name: "search_wiki", title: "Search the guide" },
        {
          method: "GET",
          path: `/api/tutorials/search?q=${encodeURIComponent(query)}`,
        },
      );
      if (!answer.ok) return refusal(answer.message);
      const hits = wikiHit.safeParse(answer.value);
      return text(JSON.stringify(hits.success ? hits.data : { hits: [] }));
    },
  );
  server.registerTool(
    "read_wiki",
    {
      title: "Read a guide page",
      description:
        "One page of Slopify's guide as Markdown, by the page id search_wiki answers (for example Schedules or Providers-and-Keys).",
      inputSchema: { page: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9-]{0,79}$/) },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ page }) => {
      const response = await deps.api(
        new Request(new URL(`/api/tutorials/${encodeURIComponent(page)}`, "http://localhost")),
      );
      if (response.ok) return text(await response.text());
      return refusal(
        `There is no guide page called ${page}. Call search_wiki and use a page id it answers.`,
      );
    },
  );
  server.registerTool(
    "current_screen",
    {
      title: "What the person has open",
      description:
        "The page the person has open in Slopify, the project, schedule, channel or template on it with their names, the section, and the rows they selected, with the ids Slopify's tools take.",
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    () => text(screenBlock(turn.screen, turn.names)),
  );
}

export interface AssistantMcpRouteDeps extends McpDeps {
  readonly host?: string | undefined;
  readonly turns: AssistantTurnTokens | undefined;
}

function rpcError(c: Context, status: ContentfulStatusCode, message: string): Response {
  return c.json({ jsonrpc: "2.0", error: { code: -32000, message }, id: null }, status);
}

const bearer = /^Bearer ([A-Za-z0-9_-]{20,200})$/;
const assistantBodyMax = 4 * 1024 * 1024;

export function assistantMcpRoutes(deps: AssistantMcpRouteDeps): Hono {
  return new Hono()
    .use("*", async (c, next) => {
      if (!viaProxy(c.req.raw.headers)) return next();
      return rpcError(c, 403, agentsLocalOnly);
    })
    .use("*", async (c, next) => {
      if (originAllowed(c.req.header("origin"), deps.host)) return next();
      return rpcError(
        c,
        403,
        "Slopify refused this request: it came from a web page at another address.",
      );
    })
    .post(
      "/",
      bodyLimit({
        maxSize: assistantBodyMax,
        onError: (c) => rpcError(c, 413, "Slopify refused this request: it is larger than 4 MB."),
      }),
      async (c) => {
        const token = bearer.exec(c.req.header("authorization") ?? "")?.[1];
        const turn = token === undefined ? undefined : deps.turns?.resolve(token);
        if (turn === undefined)
          return rpcError(
            c,
            401,
            "Slopify refused this request: this endpoint is the in-app assistant's, and only a running assistant turn's token opens it. Agents connect to /mcp instead.",
          );
        let body: unknown;
        try {
          body = await c.req.json();
        } catch {
          return rpcError(c, 400, "Slopify couldn't read this MCP request: its body is not JSON.");
        }
        const server = createAssistantMcpServer(deps, turn);
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
        "Slopify's assistant endpoint keeps no session: send each request as a POST.",
      ),
    );
}
