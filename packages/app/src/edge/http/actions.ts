import { zValidator } from "@hono/zod-validator";
import { type Context, Hono } from "hono";
import { z } from "zod";
import { stageKinds } from "../../kernel/pipeline.js";
import { derive } from "../../kernel/runner/graph.js";
import { projectById, projectPaused, stagesOf } from "../../slices/admission/repo.js";
import type { CancelDeps } from "../../slices/cancel/index.js";
import { cancelProject } from "../../slices/cancel/index.js";
import type { ControlDeps, ControlResult } from "../../slices/control/index.js";
import { pauseProject } from "../../slices/control/index.js";
import {
  type RevisionControlInput,
  revisionControlSchema,
} from "../../slices/control/revision-control-schema.js";
import type { RerunDeps } from "../../slices/reruns/index.js";
import { adoptBaseline } from "../../slices/revisions/adopt.js";
import { currentRevisionId } from "../../slices/revisions/repo.js";
import { allowsCustomModel } from "../../slices/settings/models.js";
import { providerStatuses } from "../../slices/settings/readiness.js";
import { outputsOf } from "../../slices/storage/repo.js";
import type { AppDeps } from "./app.js";
import { onInvalid, problem, titleOf } from "./problem.js";

const idParam = z.object({
  id: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[0-9A-Za-z_-]+$/),
});
const stageParam = idParam.extend({ kind: z.enum(stageKinds) });
const imageParam = idParam.extend({
  outputId: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[0-9A-Za-z_-]+$/),
});
// The return type is inferred so Hono keeps the route types the SPA's client is
// generated from; see stagingRoutes.
export function actionRoutes(deps: AppDeps) {
  const reruns: RerunDeps = {
    measureAudio: deps.measureAudio,
    db: deps.db,
    paths: deps.paths,
    ids: deps.ids,
    clock: deps.clock,
    log: deps.log,
  };
  const cancel: CancelDeps = {
    db: deps.db,
    clock: deps.clock,
    log: deps.log,
    abort: (projectId) => deps.runner.abortProject(projectId),
    hasInflight: deps.runner.hasInflight,
    emit: (projectId, event) => {
      deps.hub.emit(projectId, event);
    },
  };
  const control: ControlDeps = {
    catalogue: deps.catalogue,
    ...reruns,
    runner: deps.runner,
    emit: (projectId, event) => deps.hub.emit(projectId, event),
    providers: () => providerStatuses({ db: deps.db, probe: deps.probe }),
    allowsCustomModels: deps.catalogue ? () => false : allowsCustomModel,
    modelsFor: deps.modelsFor ?? (() => Promise.reject(new Error("Model catalog unavailable"))),
  };
  const view = (projectId: string): Record<string, unknown> => {
    const stages = stagesOf(deps.db, projectId);
    return {
      revisionId: currentRevisionId(deps.db, projectId) ?? null,
      project: {
        ...projectById(deps.db, projectId),
        status: derive(stages, projectPaused(deps.db, projectId)),
      },
      stages,
      outputs: outputsOf(deps.db, projectId),
    };
  };
  const controlled = (
    c: Parameters<typeof problem>[0],
    id: string,
    result: ControlResult,
  ): Response => {
    if (result.ok) return c.json(view(id));
    const codes = {
      "no-project": 404,
      running: 409,
      "not-editable": 409,
      "invalid-providers": 400,
      "catalog-unavailable": 503,
      "revision-required": 409,
      conflict: 409,
      "idempotency-conflict": 409,
      "rebuild-required": 409,
    } as const;
    const messages = {
      "no-project": "No project has that id.",
      running: "Pause the run and wait for its active calls to stop before changing providers.",
      "not-editable": "Providers can be changed only while a project is paused or failed.",
      "invalid-providers": "The provider choices need attention.",
      "catalog-unavailable": "The provider model catalog could not be loaded. Try again.",
      "revision-required":
        "Reload the project before using this control. A current revision and request ID are required.",
      conflict: "The project changed. Reload it before using this control.",
      "idempotency-conflict": "This request ID has already been used for a different action.",
      "rebuild-required": "Review the affected outputs and cost before rebuilding this revision.",
    };
    return problem(c, {
      status: codes[result.reason],
      title: titleOf(codes[result.reason]),
      detail: messages[result.reason],
      extensions: {
        reason: result.reason,
        currentRevisionId: currentRevisionId(deps.db, id) ?? null,
        fields: result.fields ?? [],
      },
    });
  };

  const controlInput = async (
    c: Parameters<typeof problem>[0],
    id: string,
  ): Promise<RevisionControlInput | undefined | Response> => {
    if (deps.catalogue !== undefined) adoptBaseline(deps, id);
    if (currentRevisionId(deps.db, id) === undefined) return undefined;
    let body: unknown;
    try {
      body = await c.req.json();
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
      return controlled(c, id, { ok: false, reason: "revision-required" });
    }
    const parsed = revisionControlSchema.safeParse(body);
    return parsed.success
      ? parsed.data
      : controlled(c, id, { ok: false, reason: "revision-required" });
  };

  return new Hono()
    .post("/:id/pause", zValidator("param", idParam, onInvalid), async (c) => {
      const { id } = c.req.valid("param");
      const input = await controlInput(c, id);
      return input instanceof Response
        ? input
        : controlled(c, id, await pauseProject(control, id, input));
    })
    .post("/:id/resume", zValidator("param", idParam, onInvalid), (c) => {
      const { id } = c.req.valid("param");
      return controlled(c, id, {
        ok: false,
        reason: projectById(deps.db, id) === undefined ? "no-project" : "rebuild-required",
      });
    })
    .patch("/:id/providers", zValidator("param", idParam, onInvalid), revisionRequired)
    .post("/:id/cancel", zValidator("param", idParam, onInvalid), async (c) => {
      const { id } = c.req.valid("param");
      const input = await controlInput(c, id);
      if (input instanceof Response) return input;
      const result = await cancelProject(cancel, id, input);
      if (!result.ok) return controlled(c, id, result);
      return c.json({ ...view(id), canceled: result.canceled });
    })
    .post("/:id/stages/:kind/retry", zValidator("param", stageParam, onInvalid), (c) => {
      const { id } = c.req.valid("param");
      return controlled(c, id, {
        ok: false,
        reason: projectById(deps.db, id) === undefined ? "no-project" : "rebuild-required",
      });
    })
    .post("/:id/stages/:kind/rerun", zValidator("param", stageParam, onInvalid), revisionRequired)
    .put("/:id/article", zValidator("param", idParam, onInvalid), revisionRequired)
    .delete("/:id/images/:outputId", zValidator("param", imageParam, onInvalid), revisionRequired)
    .post(
      "/:id/images/:outputId/regenerate",
      zValidator("param", imageParam, onInvalid),
      revisionRequired,
    );
}

function revisionRequired(c: Context): Response {
  return problem(c, {
    status: 409,
    title: titleOf(409),
    detail: "Open Edit project to save changes, then review the affected rebuild.",
    extensions: { reason: "revision-required" },
  });
}
