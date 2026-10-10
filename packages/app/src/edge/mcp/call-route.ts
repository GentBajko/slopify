import type { DatabaseSync } from "node:sqlite";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { Clock } from "../../kernel/clock.js";
import type { Ids } from "../../kernel/ids.js";
import { recordAgentAction } from "../../slices/agents/repo.js";
import { revisionIdOf, subjectsOf } from "./attribution.js";
import { fileArg, paramsOf, pathParam, type RouteTool, routeOf } from "./route-tool.js";

export interface RouteCallDeps {
  // The API, called in-process as the agent (`http/actor.ts`).
  readonly api: (request: Request) => Promise<Response>;
  // Where an agent's changes are recorded "by agent".
  readonly db: DatabaseSync;
  readonly ids: Ids;
  readonly clock: Clock;
}

const problemSchema = z
  .object({
    title: z.string(),
    detail: z.string().optional(),
    reason: z.string().optional(),
    currentRevisionId: z.string().nullable().optional(),
    fields: z.array(z.object({ field: z.string(), message: z.string() })).optional(),
    errors: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
  })
  .loose();
const querySchema = z.record(z.string(), z.string());
const bodySchema = z.record(z.string(), z.unknown());

export function text(value: string): CallToolResult {
  return { content: [{ type: "text", text: value }] };
}

export function refusal(value: string): CallToolResult {
  return { isError: true, content: [{ type: "text", text: value }] };
}

export async function callRoute(
  deps: RouteCallDeps,
  tool: RouteTool,
  args: Readonly<Record<string, unknown>>,
): Promise<CallToolResult> {
  const { method, path } = routeOf(tool);
  const named = paramsOf(path).find((name) => !pathParam.safeParse(args[name]).success);
  if (named !== undefined) return strayPath(tool, named);
  const filled = path.replace(/:(\w+)/g, (_, name: string) => String(args[name]));
  const url = new URL(filled, "http://localhost");
  // The URL must still be the tool's own route once resolved, or it would reach another one.
  if (url.pathname !== filled) return strayPath(tool, paramsOf(path).join(", "));
  if (tool.confirm !== undefined && args.confirmed !== true)
    return refusal(
      `${(await confirmText(deps, tool, args)) ?? tool.confirm} The web page asks for a second press here: call ${tool.name} again with confirmed: true to go ahead.`,
    );
  const query = querySchema.safeParse(args.query);
  if (query.success)
    for (const [key, value] of Object.entries(query.data)) url.searchParams.set(key, value);
  const response = await deps.api(new Request(url, { method, ...payloadOf(tool, args) }));
  const type = response.headers.get("content-type") ?? "";
  const value: unknown =
    response.ok && type.includes("json") && !type.includes("problem")
      ? await response.clone().json()
      : undefined;
  const result = await answerOf(tool, response);
  if (method !== "GET" && tool.readOnly !== true && response.ok) {
    const { projectIds, scheduleId } = subjectsOf(tool, args, value);
    for (const projectId of projectIds.length === 0 ? [null] : projectIds)
      recordAgentAction(deps.db, {
        id: deps.ids.next(),
        projectId,
        scheduleId,
        tool: tool.name,
        title: tool.title,
        revisionId: revisionIdOf(value),
        createdAt: deps.clock.now().toISOString(),
      });
  }
  return result;
}

// The consequence with this call's numbers, as the page states it; undefined when they can't
// be read, and the tool's fixed sentence is said instead.
async function confirmText(
  deps: RouteCallDeps,
  tool: RouteTool,
  args: Readonly<Record<string, unknown>>,
): Promise<string | undefined> {
  if (tool.confirmFrom === undefined) return undefined;
  const path = tool.confirmFrom.route.replace(/:(\w+)/g, (_, name: string) => String(args[name]));
  try {
    const response = await deps.api(new Request(new URL(path, "http://localhost")));
    return response.ok ? tool.confirmFrom.text(await response.json()) : undefined;
  } catch {
    return undefined;
  }
}

function strayPath(tool: RouteTool, named: string): CallToolResult {
  return refusal(
    `${tool.name} was refused: ${named} must be an id exactly as Slopify listed it (letters, digits, - and _ only), so the call stays on ${tool.route}. Take the id from the tool that listed it and call ${tool.name} again.`,
  );
}

function payloadOf(
  tool: RouteTool,
  args: Readonly<Record<string, unknown>>,
): { readonly body?: NonNullable<RequestInit["body"]>; readonly headers?: Record<string, string> } {
  if (tool.upload !== undefined) {
    const file = fileArg.parse(args.file);
    const bytes = new Uint8Array(Buffer.from(file.base64, "base64"));
    if (tool.upload === "raw")
      return { body: bytes, headers: { "content-type": file.contentType } };
    const form = new FormData();
    form.append("file", new File([bytes], file.name, { type: file.contentType }));
    return { body: form };
  }
  const body = bodySchema.safeParse(args.body);
  return body.success
    ? { body: JSON.stringify(body.data), headers: { "content-type": "application/json" } }
    : {};
}

async function answerOf(tool: RouteTool, response: Response): Promise<CallToolResult> {
  const type = response.headers.get("content-type") ?? "";
  if (type.startsWith("application/problem+json")) return problemOf(tool, await response.json());
  if (!response.ok)
    return refusal(
      `${tool.title} failed: Slopify answered HTTP ${String(response.status)} without saying why. Call ${tool.name} again; if it keeps failing, use Download diagnostics in Settings and report it.`,
    );
  if (response.status === 204 || response.body === null) return text("Done.");
  if (type.startsWith("image/"))
    return {
      content: [
        {
          type: "image",
          data: Buffer.from(await response.arrayBuffer()).toString("base64"),
          mimeType: type.split(";")[0] ?? type,
        },
      ],
    };
  if (type.includes("json")) {
    const value: unknown = await response.json();
    return text(JSON.stringify(tool.shape === undefined ? value : tool.shape(value)));
  }
  if (type.startsWith("text/")) return text(await response.text());
  return text(
    `${tool.title} answered with a ${type === "" ? "binary" : type} file of ${response.headers.get("content-length") ?? "unknown"} bytes; read project files with get_project_file.`,
  );
}

function problemOf(tool: RouteTool, raw: unknown): CallToolResult {
  const problem = problemSchema.safeParse(raw);
  if (!problem.success)
    return refusal(
      `${tool.title} was refused, and the refusal could not be read. Call ${tool.name} again; if it keeps happening, use Download diagnostics in Settings and report it.`,
    );
  const { title, detail, reason, currentRevisionId, fields, errors } = problem.data;
  // The route's own sentence, except the schema refusal's "reload the page", which fixes
  // nothing for an agent: it is told which arguments were wrong instead.
  const lead =
    errors === undefined
      ? (detail ?? title)
      : `${tool.name} was refused: its arguments don't match what Slopify accepts (${errors
          .map((error) => `${error.path === "" ? "body" : error.path}: ${error.message}`)
          .join("; ")}). Correct them and call ${tool.name} again.`;
  const unsaid = (fields ?? []).filter((field) => !lead.includes(field.message));
  const named =
    unsaid.length === 0
      ? ""
      : ` ${unsaid.map((field) => `${field.field}: ${field.message}`).join(" ")}`;
  const moved =
    reason === "conflict" && typeof currentRevisionId === "string"
      ? ` The project's current revision is ${currentRevisionId}: read it with get_project, then call ${tool.name} once more with baseRevisionId ${currentRevisionId} and a new idempotencyKey.`
      : "";
  return refusal(`${lead}${named}${moved}`);
}
