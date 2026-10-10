import type { DatabaseSync } from "node:sqlite";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { Clock } from "../../kernel/clock.js";
import { causedBy } from "../../kernel/errors.js";
import type { Ids } from "../../kernel/ids.js";
import type { Log } from "../../kernel/log.js";
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
  readonly log: Pick<Log, "write">;
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
  const filled = filledPath(path, args);
  const url = new URL(filled, "http://localhost");
  // Defense in depth: pathParam already keeps dots and slashes out, but should that rule ever
  // loosen, a URL that resolves off the tool's own route still never reaches another one.
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
      ? await response.json()
      : undefined;
  const result = await answerOf(tool, response, value);
  if (method !== "GET" && tool.unrecorded !== true && response.ok) {
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
  const path = filledPath(tool.confirmFrom.route, args);
  try {
    const response = await deps.api(new Request(new URL(path, "http://localhost")));
    return response.ok ? tool.confirmFrom.text(await response.json()) : undefined;
  } catch (error) {
    deps.log.write("warn", "mcp.confirm", {
      detail: `${tool.name} asked with its fixed consequence: reading ${path} for the numbers failed: ${causedBy(error)}`,
    });
    return undefined;
  }
}

// The route's path with this call's (already checked) parameters in place.
function filledPath(path: string, args: Readonly<Record<string, unknown>>): string {
  return path.replace(/:(\w+)/g, (_, name: string) => String(args[name]));
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

async function answerOf(
  tool: RouteTool,
  response: Response,
  value: unknown,
): Promise<CallToolResult> {
  const type = response.headers.get("content-type") ?? "";
  if (!response.ok || type.startsWith("application/problem+json"))
    return refusal((await failureOf(tool, response)).message);
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
  if (type.includes("json"))
    return text(JSON.stringify(tool.shape === undefined ? value : tool.shape(value)));
  if (type.startsWith("text/")) return text(await response.text());
  return text(
    `${tool.title} answered with a ${type === "" ? "binary" : type} file of ${response.headers.get("content-length") ?? "unknown"} bytes; read project files with get_project_file.`,
  );
}

// The tool a refusal names: what failed and what to call again.
type Named = Pick<RouteTool, "name" | "title">;
type Field = { readonly field: string; readonly message: string };

export type ApiAnswer =
  | { readonly ok: true; readonly value: unknown }
  | {
      readonly ok: false;
      readonly status: number;
      readonly message: string;
      readonly fields: readonly Field[];
    };

// One in-process call to the API as the agent, for a tool that makes several of them
// (import_library, preview_remake_outdated): the JSON it answered, or the refusal worded as a
// route tool's own call words it.
export async function callApi(
  deps: RouteCallDeps,
  tool: Named,
  method: "GET" | "POST" | "PUT",
  path: string,
  body?: unknown,
): Promise<ApiAnswer> {
  const response = await deps.api(
    new Request(new URL(path, "http://localhost"), {
      method,
      ...(body === undefined
        ? {}
        : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
    }),
  );
  if (response.ok)
    return { ok: true, value: response.body === null ? undefined : await response.json() };
  return { ok: false, status: response.status, ...(await failureOf(tool, response)) };
}

// What failed and why, with what to do next, from a refused or failed answer.
async function failureOf(
  tool: Named,
  response: Response,
): Promise<{ readonly message: string; readonly fields: readonly Field[] }> {
  const type = response.headers.get("content-type") ?? "";
  if (!type.startsWith("application/problem+json"))
    return {
      message: `${tool.title} failed: Slopify answered HTTP ${String(response.status)} without saying why. Call ${tool.name} again; if it keeps failing, use Download diagnostics in Settings and report it.`,
      fields: [],
    };
  const problem = problemSchema.safeParse(await response.json().catch(() => undefined));
  if (!problem.success)
    return {
      message: `${tool.title} was refused, and the refusal could not be read. Call ${tool.name} again; if it keeps happening, use Download diagnostics in Settings and report it.`,
      fields: [],
    };
  return { message: problemText(tool, problem.data), fields: problem.data.fields ?? [] };
}

function problemText(tool: Named, problem: z.infer<typeof problemSchema>): string {
  const { title, detail, reason, currentRevisionId, fields, errors } = problem;
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
  return `${lead}${named}${moved}`;
}
