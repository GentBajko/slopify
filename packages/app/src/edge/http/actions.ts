import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { stageKinds } from "../../kernel/pipeline.js";
import { derive } from "../../kernel/runner/graph.js";
import { projectById, stagesOf } from "../../slices/admission/repo.js";
import type { CancelDeps } from "../../slices/cancel/index.js";
import { cancelProject } from "../../slices/cancel/index.js";
import type { RerunDeps, RerunRefusal, RerunResult } from "../../slices/reruns/index.js";
import {
  deleteImage,
  editArticle,
  regenerateImage,
  rerunStage,
  retryStage,
} from "../../slices/reruns/index.js";
import { outputsOf } from "../../slices/storage/repo.js";
import type { AppDeps } from "./app.js";
import { onInvalid, problem, titleOf } from "./problem.js";

// The actions `mockup/08-project.md` puts on the project header and on each stage: Cancel,
// Retry, Re-run, Save & re-run, Regenerate one image, Delete one image. Every one of them
// changes rows and files through a slice and then ticks the runner; the route itself
// decides nothing (`logic/12`, `logic/13`).

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
// ceiling: half a megabyte of markdown, which is far past any narratable article and
// keeps a paste from filling the process's memory. A longer one needs a streamed edit.
const articleBody = z.object({ markdown: z.string().min(1).max(500_000) });

const status: Readonly<Record<RerunRefusal, 400 | 404 | 409>> = {
  "no-project": 404,
  "unknown-image": 404,
  "empty-article": 400,
  running: 409,
  "not-rerunnable": 409,
  "not-retryable": 409,
  "no-article": 409,
  "last-image": 409,
};

const details: Readonly<Record<RerunRefusal, string>> = {
  "no-project": "No project has that id.",
  "unknown-image": "This project has no image with that id.",
  "empty-article": "An article cannot be saved empty.",
  // logic/12 preconditions: "no stage of the project is `running` (§Q106)".
  running: "This project is still running. Cancel it or wait for it to finish.",
  "not-rerunnable": "Only a stage that has finished, failed, or been canceled can be re-run.",
  "not-retryable": "Only a failed or canceled stage can be retried.",
  "no-article": "This project has no article to edit yet.",
  // logic/09 §Q75 and logic/12's invariant: "at least one image always remains".
  "last-image": "At least one image must remain, so the last one cannot be deleted.",
};

// The return type is inferred so Hono keeps the route types the SPA's client is
// generated from; see stagingRoutes.
export function actionRoutes(deps: AppDeps) {
  const reruns: RerunDeps = {
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
    emit: (projectId, event) => {
      deps.hub.emit(projectId, event);
    },
  };
  const view = (projectId: string): Record<string, unknown> => {
    const stages = stagesOf(deps.db, projectId);
    return {
      project: { ...projectById(deps.db, projectId), status: derive(stages) },
      stages,
      outputs: outputsOf(deps.db, projectId),
    };
  };
  // Every re-run action ends the same way: the rows are written, then the runner is
  // asked to look at the project. `logic/12` step 9 does the rest by itself.
  const started = (
    c: Parameters<typeof problem>[0],
    projectId: string,
    result: RerunResult,
  ): Response => {
    if (!result.ok) {
      return problem(c, {
        status: status[result.reason],
        title: titleOf(status[result.reason]),
        detail: details[result.reason],
      });
    }
    deps.runner.tick(projectId);
    return c.json({ ...view(projectId), redone: result.redone });
  };

  return new Hono()
    .post("/:id/cancel", zValidator("param", idParam, onInvalid), async (c) => {
      const { id } = c.req.valid("param");
      const result = await cancelProject(cancel, id);
      if (!result.ok) {
        return problem(c, { status: 404, title: titleOf(404), detail: details["no-project"] });
      }
      // No tick: §Q111 leaves a canceled project sitting until the user retries a stage.
      return c.json({ ...view(id), canceled: result.canceled });
    })
    .post("/:id/stages/:kind/retry", zValidator("param", stageParam, onInvalid), (c) => {
      const { id, kind } = c.req.valid("param");
      return started(c, id, retryStage(reruns, id, kind));
    })
    .post("/:id/stages/:kind/rerun", zValidator("param", stageParam, onInvalid), (c) => {
      const { id, kind } = c.req.valid("param");
      return started(c, id, rerunStage(reruns, id, kind));
    })
    .put(
      "/:id/article",
      zValidator("param", idParam, onInvalid),
      zValidator("json", articleBody, onInvalid),
      (c) => {
        const { id } = c.req.valid("param");
        return started(c, id, editArticle(reruns, id, c.req.valid("json").markdown));
      },
    )
    .delete("/:id/images/:outputId", zValidator("param", imageParam, onInvalid), (c) => {
      const { id, outputId } = c.req.valid("param");
      return started(c, id, deleteImage(reruns, id, outputId));
    })
    .post("/:id/images/:outputId/regenerate", zValidator("param", imageParam, onInvalid), (c) => {
      const { id, outputId } = c.req.valid("param");
      return started(c, id, regenerateImage(reruns, id, outputId));
    });
}
