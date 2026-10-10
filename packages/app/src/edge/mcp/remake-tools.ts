import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { isSampleProject } from "../../slices/onboarding/sample.js";
import {
  type CostTotal,
  previewBlocker,
  remadeWork,
  remakeBlocker,
  remakeTotal,
} from "../../slices/rebuild/remake-outdated.js";
import { type RouteCallDeps, text } from "./call-route.js";

const projectSchema = z
  .object({ project: z.object({ title: z.string(), status: z.string() }).loose() })
  .loose();
const baselineSchema = z
  .object({ view: z.object({ revision: z.object({ id: z.string() }) }) })
  .loose();
const previewSchema = z
  .object({
    value: z
      .object({
        id: z.string(),
        baseRevisionId: z.string(),
        work: z.array(
          z
            .object({
              key: z.string(),
              disposition: z.enum(["reuse", "generate", "local", "review", "blocked"]),
              reason: z.string(),
            })
            .loose(),
        ),
        providedReuseRequired: z.array(z.string()),
        costs: z.object({ low: z.number(), high: z.number(), unknown: z.number() }).loose(),
      })
      .loose(),
  })
  .loose();
const problemSchema = z.object({ title: z.string(), detail: z.string().optional() }).loose();

interface Plan {
  readonly projectId: string;
  readonly title: string;
  readonly baseRevisionId: string;
  readonly previewId: string;
  readonly remakes: readonly string[];
  readonly cost: CostTotal;
}
interface Skip {
  readonly projectId: string;
  readonly title: string;
  readonly reason: string;
}

async function call(
  deps: RouteCallDeps,
  method: "GET" | "POST",
  path: string,
  body?: unknown,
): Promise<
  { readonly ok: true; readonly value: unknown } | { readonly ok: false; readonly message: string }
> {
  const response = await deps.api(
    new Request(new URL(path, "http://localhost"), {
      method,
      ...(body === undefined
        ? {}
        : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
    }),
  );
  const value: unknown = response.body === null ? undefined : await response.json();
  if (response.ok) return { ok: true, value };
  const problem = problemSchema.safeParse(value);
  return {
    ok: false,
    message: problem.success
      ? (problem.data.detail ?? problem.data.title)
      : `Slopify answered HTTP ${String(response.status)} without saying why.`,
  };
}

// The same steps as the page's Remake outdated (`web/src/routes/projects-remake.ts`): the
// project's own version, then Choose what to remake for every outdated output.
async function planOne(deps: RouteCallDeps, projectId: string): Promise<Plan | Skip> {
  const at = `/api/projects/${encodeURIComponent(projectId)}`;
  const unread = (message: string): Skip => ({
    projectId,
    title: "",
    reason: `It couldn't be checked: ${message}`,
  });
  const read = await call(deps, "GET", at);
  if (!read.ok) return unread(read.message);
  const project = projectSchema.safeParse(read.value);
  if (!project.success) return unread("its page could not be read.");
  const { title, status } = project.data.project;
  const blocker = remakeBlocker(status, isSampleProject(deps.db, projectId));
  if (blocker !== undefined) return { projectId, title, reason: blocker };
  const base = await call(deps, "POST", `${at}/revisions/prepare`);
  const baseline = base.ok ? baselineSchema.safeParse(base.value) : undefined;
  if (!base.ok) return { ...unread(base.message), title };
  if (baseline === undefined || !baseline.success)
    return { ...unread("its saved version could not be read."), title };
  const previewed = await call(deps, "POST", `${at}/rebuild/preview`, {
    baseRevisionId: baseline.data.view.revision.id,
    request: { kind: "allAffected" },
  });
  if (!previewed.ok) return { ...unread(previewed.message), title };
  const preview = previewSchema.safeParse(previewed.value);
  if (!preview.success) return { ...unread("its remake could not be read."), title };
  const shown = preview.data.value;
  const blocked = previewBlocker(shown, (key) => key);
  if (blocked !== undefined) return { projectId, title, reason: blocked };
  return {
    projectId,
    title,
    baseRevisionId: shown.baseRevisionId,
    previewId: shown.id,
    remakes: remadeWork(shown.work).map((work) => work.key),
    cost: { low: shown.costs.low, high: shown.costs.high, unknown: shown.costs.unknown },
  };
}

export async function remakeOutdated(
  deps: RouteCallDeps,
  projectIds: readonly string[],
): Promise<CallToolResult> {
  const answers: (Plan | Skip)[] = [];
  // One project at a time: each preview plans a whole project.
  for (const projectId of new Set(projectIds)) answers.push(await planOne(deps, projectId));
  const plans = answers.filter((answer): answer is Plan => "previewId" in answer);
  return text(
    JSON.stringify({
      plans,
      skipped: answers.filter((answer): answer is Skip => "reason" in answer),
      total: remakeTotal(plans.map((plan) => plan.cost)),
      next: "Nothing has started. Start each plan you accept with start_rebuild {baseRevisionId, previewId, idempotencyKey: a new UUID, acknowledgeUnknownCosts: true only after reading the unknown costs, confirmedProvidedWorkKeys: []}.",
    }),
  );
}

export function registerRemakeTools(server: McpServer, deps: RouteCallDeps): void {
  server.registerTool(
    "preview_remake_outdated",
    {
      title: "Remake outdated",
      description:
        "Remake outdated for several projects, like the Projects list's selection bar: each project's Choose what to remake for every outdated output with its estimate, the projects it leaves out and why, and the single total. Nothing starts here.",
      inputSchema: { projectIds: z.array(z.string().min(1).max(64)).min(1).max(2000) },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    ({ projectIds }) => remakeOutdated(deps, projectIds),
  );
}
