import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { isSampleProject } from "../../slices/onboarding/sample.js";
import { rebuildPreviewSchema } from "../../slices/rebuild/model.js";
import {
  type CostTotal,
  previewBlocker,
  remadeWork,
  remakeBlocker,
  remakeTotal,
} from "../../slices/rebuild/remake-outdated.js";
import { callApi, type RouteCallDeps, text } from "./call-route.js";
import { pathParam } from "./route-tool.js";

const projectSchema = z
  .object({ project: z.object({ title: z.string(), status: z.string() }).loose() })
  .loose();
const baselineSchema = z
  .object({ view: z.object({ revision: z.object({ id: z.string() }) }) })
  .loose();
const previewSchema = z.object({ value: rebuildPreviewSchema }).loose();
const remakeTool = { name: "preview_remake_outdated", title: "Remake outdated" } as const;

// An answer this tool can't read: the project is left out, and the page can still do it.
const unreadable = (what: string): string =>
  `its ${what} came back in a shape this tool doesn't read. Open the project and use Remake outdated on the Projects list; if it keeps happening, use Download diagnostics in Settings and report it.`;

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

// The same steps as the page's Remake outdated (`web/src/routes/projects-remake.ts`): the
// project's own version, then Choose what to remake for every outdated output.
async function planOne(deps: RouteCallDeps, projectId: string): Promise<Plan | Skip> {
  const at = `/api/projects/${encodeURIComponent(projectId)}`;
  const unread = (message: string): Skip => ({
    projectId,
    title: "",
    reason: `It couldn't be checked: ${message}`,
  });
  const read = await callApi(deps, remakeTool, { method: "GET", path: at, projectId });
  if (!read.ok) return unread(read.message);
  const project = projectSchema.safeParse(read.value);
  if (!project.success) return unread(unreadable("project page"));
  const { title, status } = project.data.project;
  const blocker = remakeBlocker(status, isSampleProject(deps.db, projectId));
  if (blocker !== undefined) return { projectId, title, reason: blocker };
  const base = await callApi(deps, remakeTool, {
    method: "POST",
    path: `${at}/revisions/prepare`,
    projectId,
  });
  const baseline = base.ok ? baselineSchema.safeParse(base.value) : undefined;
  if (!base.ok) return { ...unread(base.message), title };
  if (baseline === undefined || !baseline.success)
    return { ...unread(unreadable("saved version")), title };
  const previewed = await callApi(deps, remakeTool, {
    method: "POST",
    path: `${at}/rebuild/preview`,
    body: { baseRevisionId: baseline.data.view.revision.id, request: { kind: "allAffected" } },
    projectId,
  });
  if (!previewed.ok) return { ...unread(previewed.message), title };
  const preview = previewSchema.safeParse(previewed.value);
  if (!preview.success) return { ...unread(unreadable("remake plan")), title };
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
    remakeTool.name,
    {
      title: remakeTool.title,
      description:
        "Remake outdated for several projects, like the Projects list's selection bar: each project's Choose what to remake for every outdated output with its estimate, the projects it leaves out and why, and the single total. Nothing starts here.",
      inputSchema: { projectIds: z.array(pathParam).min(1).max(2000) },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    ({ projectIds }) => remakeOutdated(deps, projectIds),
  );
}
