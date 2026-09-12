import type { Context } from "hono";
import type { DraftResult } from "../../slices/play-drafts/model.js";
import { problem, titleOf } from "./problem.js";

export function draftProblem(
  c: Context,
  result: Extract<DraftResult<never>, { ok: false }>,
): Response {
  const status =
    result.reason === "not-found"
      ? 404
      : ["invalid-edit", "readiness"].includes(result.reason)
        ? 400
        : 409;
  const { ok: _ok, ...extensions } = result;
  return problem(c, {
    status,
    title: titleOf(status),
    detail: "Review the saved draft and the listed fields.",
    extensions,
  });
}
