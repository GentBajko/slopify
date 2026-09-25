import { zValidator } from "@hono/zod-validator";
import { type Context, Hono } from "hono";
import { z } from "zod";
import { stageKinds } from "../../kernel/pipeline.js";
import { derive } from "../../kernel/runner/graph.js";
import { projectById, projectPaused, stagesOf } from "../../slices/admission/repo.js";
import type { CancelDeps } from "../../slices/cancel/index.js";
import { cancelProject } from "../../slices/cancel/index.js";
import { settleReleasedCheckpoints } from "../../slices/checkpoints/recovery.js";
import type { ControlDeps, ControlResult } from "../../slices/control/index.js";
import { pauseProject } from "../../slices/control/index.js";
import {
  type RevisionControlInput,
  revisionControlSchema,
} from "../../slices/control/revision-control-schema.js";
import { recoverProject } from "../../slices/rebuild/recovery.js";
import { type RecoveryRequest, recoveryResultSchema } from "../../slices/rebuild/recovery-model.js";
import { resumable } from "../../slices/rebuild/recovery-repo.js";
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
    settleCheckpoints: (projectId) => settleReleasedCheckpoints(deps, projectId),
    emit: (projectId, event) => {
      deps.hub.emit(projectId, event);
    },
  };
  const control: ControlDeps = {
    catalogue: deps.catalogue,
    ...reruns,
    runner: deps.runner,
    emit: (projectId, event) => deps.hub.emit(projectId, event),
    providers: () =>
      providerStatuses({ db: deps.db, probe: deps.probe, hostCliStatus: deps.hostCliStatus }),
    allowsCustomModels: deps.catalogue ? () => false : allowsCustomModel,
    modelsFor: deps.modelsFor ?? (() => Promise.reject(new Error("Model catalog unavailable"))),
  };
  const view = (projectId: string): Record<string, unknown> => {
    const stages = stagesOf(deps.db, projectId);
    return {
      revisionId: currentRevisionId(deps.db, projectId) ?? null,
      resumable: resumable(deps.db, projectId),
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
      "no-project": "This project no longer exists. Go back to Projects to pick another.",
      running:
        "This project is still running. Pause it and wait for the current step to stop before changing providers.",
      "not-editable":
        "Providers can be changed only while the project is paused or has failed. Pause it first, then try again.",
      "invalid-providers":
        "Some provider choices are not valid. Fix the highlighted fields and try again.",
      "catalog-unavailable":
        "Slopify could not load the list of available models. Wait a moment and try again; if it keeps failing, check Settings → Models.",
      "revision-required": "This page is out of date. Reload the page, then try again.",
      conflict:
        "This project changed since the page loaded. Reload the page to see the latest, then try again.",
      "idempotency-conflict":
        "This action was already sent with different details. Reload the page, then try again.",
      "rebuild-required":
        "This change needs some outputs to be made again. In the Edit tab, use Rebuild affected outputs to see what will be regenerated and what it costs.",
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

  const recovery = async (
    c: Context,
    id: string,
    input: RevisionControlInput,
    action: RecoveryRequest["action"],
  ): Promise<Response> => {
    if (deps.rebuild === undefined)
      return problem(c, {
        status: 503,
        title: titleOf(503),
        detail:
          "Resume and retry are not ready yet because Slopify is still starting. Wait a moment, reload the page and try again.",
      });
    const result = recoveryResultSchema.parse(
      await recoverProject(deps.rebuild, id, { ...input, action }),
    );
    if (result.ok) return c.json(result, 202);
    const status =
      result.reason === "no-project" || result.reason === "no-revision"
        ? 404
        : result.reason === "invalid-selection" || result.reason === "invalid-edit"
          ? 400
          : 409;
    const messages: Record<typeof result.reason, string> = {
      "no-project": "This project no longer exists. Go back to Projects to pick another.",
      "no-revision":
        "The project's saved settings changed since the page loaded. Reload the page, then try again.",
      conflict:
        "This project changed since the page loaded. Reload the page to see the latest, then use Resume again.",
      "idempotency-conflict":
        "This action was already sent with different details. Reload the page, then try again.",
      "invalid-edit":
        "This section has settings that need fixing first. Open the Edit tab, choose Edit project and correct this section, then try again.",
      "stale-preview":
        "What needs to be made changed since the page loaded. Reload the page, then use Resume again.",
      "invalid-selection":
        "This section has nothing generated to re-run because its content was supplied by you. To change it, open the Edit tab and choose Edit project.",
      "review-required":
        "Content you supplied or captions you edited by hand would be replaced. Change them in the Edit tab with Edit project, or use Rebuild affected outputs to confirm the replacement.",
      "cost-ack-required":
        "This re-run needs you to review its cost first. In the Edit tab, use Rebuild affected outputs.",
      readiness:
        "Slopify cannot run this yet. Check the provider, model, voice and any files you supplied, then use Resume.",
      running:
        "This section is still running. Wait for it to finish, or Pause the project, before re-running it.",
      "accepted-job":
        "This section has a finished provider job that Slopify has not collected yet.",
      "control-changed":
        "Another action on this project (such as Pause or Cancel) happened at the same time. Reload the page to see its current state, then try again.",
    };
    const detail = [
      messages[result.reason],
      ...(result.fields ?? []).map((row) => row.message),
      ...(result.intentRevisionId === undefined
        ? []
        : [
            "Your re-run request was saved. Use Resume to continue it instead of re-running again.",
          ]),
    ].join(" ");
    return problem(c, {
      status,
      title: titleOf(status),
      detail,
      extensions: {
        reason: result.reason,
        fields: result.fields ?? [],
        currentRevisionId: currentRevisionId(deps.db, id) ?? null,
        ...(result.intentRevisionId === undefined
          ? {}
          : { intentRevisionId: result.intentRevisionId }),
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
    .post(
      "/:id/resume",
      zValidator("param", idParam, onInvalid),
      zValidator("json", revisionControlSchema, onInvalid),
      (c) => recovery(c, c.req.valid("param").id, c.req.valid("json"), { kind: "resume" }),
    )
    .patch("/:id/providers", zValidator("param", idParam, onInvalid), revisionRequired)
    .post("/:id/cancel", zValidator("param", idParam, onInvalid), async (c) => {
      const { id } = c.req.valid("param");
      const input = await controlInput(c, id);
      if (input instanceof Response) return input;
      const result = await cancelProject(cancel, id, input);
      if (!result.ok) return controlled(c, id, result);
      return c.json({ ...view(id), canceled: result.canceled });
    })
    .post(
      "/:id/stages/:kind/retry",
      zValidator("param", stageParam, onInvalid),
      zValidator("json", revisionControlSchema, onInvalid),
      (c) =>
        recovery(c, c.req.valid("param").id, c.req.valid("json"), {
          kind: "retry",
          stage: c.req.valid("param").kind,
        }),
    )
    .post(
      "/:id/stages/:kind/rerun",
      zValidator("param", stageParam, onInvalid),
      zValidator("json", revisionControlSchema, onInvalid),
      (c) =>
        recovery(c, c.req.valid("param").id, c.req.valid("json"), {
          kind: "rerun",
          stage: c.req.valid("param").kind,
        }),
    )
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
    detail:
      "This change is now made from the Edit tab. Choose Edit project, save your change, then use Rebuild affected outputs.",
    extensions: { reason: "revision-required" },
  });
}
