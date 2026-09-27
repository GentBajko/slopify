import { zValidator } from "@hono/zod-validator";
import { type Context, Hono } from "hono";
import { z } from "zod";
import { revisionControlSchema } from "../../slices/control/revision-control-schema.js";
import { recoverProject } from "../../slices/rebuild/recovery.js";
import type { RecoveryResult } from "../../slices/rebuild/recovery-model.js";
import { actOnVerdict, listVerdicts, verdictById } from "../../slices/reviews/repo.js";
import { latestReviews } from "../../slices/reviews/view.js";
import { currentRevisionId } from "../../slices/revisions/repo.js";
import { getRevisionView } from "../../slices/revisions/view.js";
import type { AppDeps } from "./app.js";
import { onInvalid, problem, titleOf } from "./problem.js";

const id = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[0-9A-Za-z_-]+$/);
const projectParam = z.object({ id });
const verdictParam = projectParam.extend({ verdictId: id });

// The project page's review column: each reviewed item's latest verdict with its reasons,
// Overrule to accept a failed item as it is, and Redo to have it made again through the
// same path as Re-run section.
export function reviewRoutes(deps: AppDeps) {
  const gone = (c: Context) =>
    problem(c, {
      status: 404,
      title: titleOf(404),
      detail:
        "This review no longer exists; the project may have been deleted or restored from a backup. Reload the project page.",
    });
  const notify = (projectId: string) => {
    try {
      deps.hub.emit(projectId, { type: "project.updated", projectId });
    } catch (error) {
      deps.log.write("error", "review.notify", {
        projectId,
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  };
  return new Hono()
    .get("/:id/reviews", zValidator("param", projectParam, onInvalid), (c) => {
      const projectId = c.req.valid("param").id;
      const head = currentRevisionId(deps.db, projectId);
      const view = head === undefined ? undefined : getRevisionView(deps, projectId, head);
      const outputs = (view?.outputs ?? [])
        .filter((row) => row.selected)
        .map((row) => ({
          workKey: row.workKey,
          fingerprint: row.fingerprint,
          outputId: row.output.id,
        }));
      return c.json({ reviews: latestReviews(listVerdicts(deps.db, projectId), outputs) });
    })
    .post("/:id/reviews/:verdictId/overrule", zValidator("param", verdictParam, onInvalid), (c) => {
      const { id: projectId, verdictId } = c.req.valid("param");
      const result = actOnVerdict(
        deps.db,
        projectId,
        verdictId,
        "overruled",
        deps.clock.now().toISOString(),
      );
      if (!result.ok)
        return result.reason === "not-found"
          ? gone(c)
          : problem(c, {
              status: 409,
              title: titleOf(409),
              detail:
                "This verdict can't be overruled: it passed, or Slopify is already making the item again. Reload the project page to see where it is.",
              extensions: { reason: "conflict" },
            });
      notify(projectId);
      return c.json({ review: result.value });
    })
    .post(
      "/:id/reviews/:verdictId/redo",
      zValidator("param", verdictParam, onInvalid),
      zValidator("json", revisionControlSchema, onInvalid),
      async (c) => {
        const { id: projectId, verdictId } = c.req.valid("param");
        const verdict = verdictById(deps.db, projectId, verdictId);
        if (verdict === undefined) return gone(c);
        if (deps.rebuild === undefined)
          return problem(c, {
            status: 503,
            title: titleOf(503),
            detail:
              "Redo is not ready yet because Slopify is still starting. Wait a moment, reload the page and try again.",
          });
        if (verdict.redoState === "pending" || verdict.redoState === "started")
          return problem(c, {
            status: 409,
            title: titleOf(409),
            detail:
              "Slopify is already making this item again. Wait for it to land, then reload the project page.",
            extensions: { reason: "conflict" },
          });
        const result = await recoverProject(deps.rebuild, projectId, {
          ...c.req.valid("json"),
          action: { kind: "redo", item: verdict.itemKey },
        });
        if (!result.ok) return refused(c, result, projectId);
        actOnVerdict(deps.db, projectId, verdictId, "redone", deps.clock.now().toISOString());
        notify(projectId);
        return c.json(result, 202);
      },
    );

  function refused(
    c: Context,
    result: Extract<RecoveryResult, { ok: false }>,
    projectId: string,
  ): Response {
    const status =
      result.reason === "no-project"
        ? 404
        : result.reason === "invalid-selection" || result.reason === "invalid-edit"
          ? 400
          : 409;
    const lead =
      result.reason === "running"
        ? "This item, or work that depends on it, is still running. Wait for it to finish, or Pause the project, then use Redo again."
        : result.reason === "readiness"
          ? "Slopify can't make this item again yet. Fix what is listed in Settings → Providers or Edit project, then use Redo again."
          : result.reason === "conflict" || result.reason === "control-changed"
            ? "This project changed since the page loaded. Reload the project page, then use Redo again."
            : result.reason === "invalid-selection"
              ? "This item can't be made again."
              : "Slopify couldn't make this item again.";
    return problem(c, {
      status,
      title: titleOf(status),
      detail: [lead, ...(result.fields ?? []).map((row) => row.message)].join(" "),
      extensions: {
        reason: result.reason,
        fields: result.fields ?? [],
        currentRevisionId: currentRevisionId(deps.db, projectId) ?? null,
      },
    });
  }
}
