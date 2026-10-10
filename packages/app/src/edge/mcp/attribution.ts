import { z } from "zod";
import { paramsOf, type RouteTool, routeOf } from "./route-tool.js";

export interface ActionSubjects {
  readonly projectIds: readonly string[];
  readonly scheduleId: string | null;
}

const madeBody = z
  .object({ projectIds: z.array(z.string()).optional(), projectId: z.string().optional() })
  .loose();
const movedBody = z.object({ projectIds: z.array(z.string()) }).loose();
const trashBody = z
  .object({ items: z.array(z.object({ kind: z.string(), id: z.string() })) })
  .loose();
const savedVersion = z
  .object({ view: z.object({ revision: z.object({ id: z.string() }) }) })
  .loose();

// The projects a tool changed (the one its path names, those its body lists, or those its
// answer made) and the schedule it changed.
export function subjectsOf(
  tool: RouteTool,
  args: Readonly<Record<string, unknown>>,
  value: unknown,
): ActionSubjects {
  const { path } = routeOf(tool);
  return {
    projectIds: projectIdsOf(path, args, value),
    scheduleId:
      path.startsWith("/api/schedules/:id") && typeof args.id === "string" ? args.id : null,
  };
}

function projectIdsOf(
  path: string,
  args: Readonly<Record<string, unknown>>,
  value: unknown,
): readonly string[] {
  if (path.includes("/projects/:id") && typeof args.id === "string") return [args.id];
  if (paramsOf(path).includes("projectId") && typeof args.projectId === "string")
    return [args.projectId];
  if (path.startsWith("/api/trash/:kind/:id"))
    return args.kind === "project" && typeof args.id === "string" ? [args.id] : [];
  const moved = movedBody.safeParse(args.body);
  if (moved.success) return moved.data.projectIds;
  const trashed = trashBody.safeParse(args.body);
  if (trashed.success)
    return trashed.data.items.filter((item) => item.kind === "project").map((item) => item.id);
  const made = madeBody.safeParse(value);
  if (!made.success) return [];
  return [
    ...(made.data.projectIds ?? []),
    ...(made.data.projectId === undefined ? [] : [made.data.projectId]),
  ];
}

export function revisionIdOf(value: unknown): string | null {
  const saved = savedVersion.safeParse(value);
  return saved.success ? saved.data.view.revision.id : null;
}
