import { zValidator } from "@hono/zod-validator";
import { type Context, Hono } from "hono";
import { z } from "zod";
import { answerExternalReview } from "../../slices/reviews/external.js";
import { verdictAnswerSchema, verdictIssue } from "../../slices/reviews/verdict.js";
import { actorOf } from "./actor.js";
import type { AppDeps } from "./app.js";
import { onInvalid, problem, titleOf, type ValidationIssue } from "./problem.js";

const id = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[0-9A-Za-z_-]+$/);
const reviewParam = z.object({ id, reviewId: id });

// A verdict that isn't {verdict, reasons} in the reviewer's rules: what was wrong, and that the
// review still waits for a fixed one.
function verdictRefused(
  result:
    | { readonly success: true }
    | { readonly success: false; readonly error: { readonly issues: readonly ValidationIssue[] } },
  c: Context,
): Response | undefined {
  if (result.success) return undefined;
  return problem(c, {
    status: 400,
    title: titleOf(400),
    detail: `The verdict wasn't saved${verdictIssue(result.error.issues, "it is not {verdict, reasons}")}. The review is still waiting: send {verdict: "pass" | "fail", reasons} again with that fixed.`,
    extensions: { reason: "invalid-verdict" },
  });
}

// An external agent's verdict on a review waiting for it (`slices/reviews/external.ts`). The
// rules are the reviewer model's own; the outcome is decided when the review step runs again.
export function externalReviewRoutes(deps: AppDeps) {
  return new Hono().post(
    "/:id/external-reviews/:reviewId/verdict",
    zValidator("param", reviewParam, onInvalid),
    zValidator("json", verdictAnswerSchema, verdictRefused),
    async (c) => {
      const { id: projectId, reviewId } = c.req.valid("param");
      const answer = c.req.valid("json");
      const result = answerExternalReview(deps.db, {
        projectId,
        id: reviewId,
        verdict: { passed: answer.verdict === "pass", reasons: answer.reasons },
        by: actorOf(c),
        at: deps.clock.now().toISOString(),
      });
      if (!result.ok && result.reason === "trashed")
        return problem(c, {
          status: 409,
          title: titleOf(409),
          detail:
            "This review's project is in the Trash, so the verdict wasn't saved. Restore the project in Settings → Backup & storage → Trash; the review then waits for its verdict again.",
          extensions: { reason: "trashed" },
        });
      if (!result.ok)
        return result.reason === "not-found"
          ? problem(c, {
              status: 404,
              title: titleOf(404),
              detail:
                "This review doesn't exist: the project may have been deleted. Call needs_attention to see what is waiting now.",
              extensions: { reason: "not-found" },
            })
          : problem(c, {
              status: 409,
              title: titleOf(409),
              detail:
                result.reason === "superseded"
                  ? "This review was replaced: its item was made again or edited, and the new one waits for its own verdict. Call needs_attention to see it."
                  : `This review was already answered (${result.value.state === "auto-passed" ? "it passed at its 2-hour deadline" : "another verdict was saved first"}), so this verdict wasn't saved. Call needs_attention to see what is waiting now.`,
              extensions: { reason: result.reason },
            });
      try {
        deps.runner.tick(projectId);
      } catch (error) {
        deps.log.write("error", "review.wake", {
          projectId,
          detail: error instanceof Error ? error.message : String(error),
        });
      }
      deps.hub.emit(projectId, { type: "project.updated", projectId });
      return c.json({ review: { id: result.value.id, state: result.value.state } });
    },
  );
}
