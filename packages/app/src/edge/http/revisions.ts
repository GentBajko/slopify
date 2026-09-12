import { zValidator } from "@hono/zod-validator";
import { type Context, Hono } from "hono";
import { z } from "zod";
import { projectExists } from "../../slices/admission/repo.js";
import type { FieldError } from "../../slices/admission/rules.js";
import { previewRebuildSchema, startRebuildSchema } from "../../slices/rebuild/model.js";
import { previewRebuild, startRebuild } from "../../slices/rebuild/service.js";
import { ensureBaseline, restoreRevision, saveRevision } from "../../slices/revisions/index.js";
import { currentRevisionId, listRevisionHistory } from "../../slices/revisions/repo.js";
import { restoreRevisionSchema, saveRevisionSchema } from "../../slices/revisions/schema.js";
import { getRevisionView } from "../../slices/revisions/view.js";
import type { AppDeps } from "./app.js";
import { onInvalid, problem, titleOf } from "./problem.js";

const id = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[0-9A-Za-z_-]+$/);
const projectParam = z.object({ id });
const revisionParam = projectParam.extend({ revisionId: id });
const saveBody = saveRevisionSchema.extend({ idempotencyKey: z.uuid() });
const restoreBody = restoreRevisionSchema.extend({ idempotencyKey: z.uuid() });
const statuses = {
  "no-project": 404,
  "no-revision": 404,
  conflict: 409,
  "idempotency-conflict": 409,
  "invalid-edit": 400,
  "stale-preview": 409,
  "invalid-selection": 400,
  "review-required": 409,
  "cost-ack-required": 409,
  readiness: 409,
} as const;
function refused(
  c: Context,
  deps: AppDeps,
  projectId: string,
  value: {
    readonly reason: keyof typeof statuses;
    readonly fields?: readonly FieldError[] | undefined;
  },
): Response {
  const status = statuses[value.reason];
  return problem(c, {
    status,
    title: titleOf(status),
    detail: value.reason.replaceAll("-", " "),
    extensions: {
      reason: value.reason,
      currentRevisionId: currentRevisionId(deps.db, projectId) ?? null,
      fields: value.fields ?? [],
    },
  });
}
function unavailable(c: Context): Response {
  return problem(c, {
    status: 503,
    title: titleOf(503),
    detail: "Rebuild services are unavailable.",
  });
}

export function revisionRoutes(deps: AppDeps) {
  return new Hono()
    .post("/:id/revisions/prepare", zValidator("param", projectParam, onInvalid), async (c) => {
      const projectId = c.req.valid("param").id;
      const result = await ensureBaseline(deps, projectId);
      return result.ok ? c.json(result) : refused(c, deps, projectId, result);
    })
    .get("/:id/revisions", zValidator("param", projectParam, onInvalid), (c) => {
      const projectId = c.req.valid("param").id;
      return projectExists(deps.db, projectId)
        ? c.json({ revisions: listRevisionHistory(deps.db, projectId) })
        : refused(c, deps, projectId, { reason: "no-project" });
    })
    .get("/:id/revisions/:revisionId", zValidator("param", revisionParam, onInvalid), (c) => {
      const { id: projectId, revisionId } = c.req.valid("param");
      const view = getRevisionView(deps, projectId, revisionId);
      return view === undefined
        ? refused(c, deps, projectId, { reason: "no-revision" })
        : c.json({ view });
    })
    .post(
      "/:id/revisions",
      zValidator("param", projectParam, onInvalid),
      zValidator("json", saveBody, onInvalid),
      async (c) => {
        const projectId = c.req.valid("param").id;
        const result = await saveRevision(deps, { projectId, ...c.req.valid("json") });
        if (!result.ok) return refused(c, deps, projectId, result);
        deps.hub.emit(projectId, { type: "project.updated", projectId });
        return c.json(result);
      },
    )
    .post(
      "/:id/revisions/restore",
      zValidator("param", projectParam, onInvalid),
      zValidator("json", restoreBody, onInvalid),
      async (c) => {
        const projectId = c.req.valid("param").id;
        const result = await restoreRevision(deps, { projectId, ...c.req.valid("json") });
        if (!result.ok) return refused(c, deps, projectId, result);
        deps.hub.emit(projectId, { type: "project.updated", projectId });
        return c.json(result);
      },
    )
    .post(
      "/:id/rebuild/preview",
      zValidator("param", projectParam, onInvalid),
      zValidator("json", previewRebuildSchema, onInvalid),
      async (c) => {
        if (deps.rebuild === undefined) return unavailable(c);
        const projectId = c.req.valid("param").id;
        const result = await previewRebuild(deps.rebuild, { projectId, ...c.req.valid("json") });
        return result.ok ? c.json(result) : refused(c, deps, projectId, result);
      },
    )
    .post(
      "/:id/rebuild",
      zValidator("param", projectParam, onInvalid),
      zValidator("json", startRebuildSchema, onInvalid),
      async (c) => {
        if (deps.rebuild === undefined) return unavailable(c);
        const projectId = c.req.valid("param").id;
        const result = await startRebuild(deps.rebuild, { projectId, ...c.req.valid("json") });
        return result.ok ? c.json(result, 202) : refused(c, deps, projectId, result);
      },
    );
}
