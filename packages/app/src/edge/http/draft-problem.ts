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
  const details: Readonly<Record<typeof result.reason, string>> = {
    "not-found":
      "This draft no longer exists; it may have been started or deleted. Reload the page to start a new one.",
    "invalid-draft":
      "This saved draft could not be read. Reload the page and set the video up again in Play.",
    conflict:
      "This draft changed in another tab or window. Reload the page to see the latest, then make your change again.",
    "invalid-edit": "Some settings need fixing. Fix the highlighted fields, then try again.",
    "pending-start": "This video is already starting. Wait a moment, then find it in Projects.",
    "already-started": "This draft was already started. Find the video in Projects.",
    "stale-review":
      "Something changed since you reviewed this video, such as a setting or a price. Choose Review and start again to see the latest.",
    readiness:
      "Slopify is not ready to start this video yet. Fix the highlighted problems, then try again.",
  };
  return problem(c, {
    status,
    title: titleOf(status),
    detail: details[result.reason],
    extensions,
  });
}
