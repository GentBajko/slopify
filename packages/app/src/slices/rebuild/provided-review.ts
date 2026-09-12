import type { DatabaseSync } from "node:sqlite";
import { requestHash } from "../revisions/mutation-request.js";
import type { RevisionWorkPlan } from "./recipe-work.js";

export function providedDependencyFingerprint(plan: RevisionWorkPlan, key: string): string {
  const recipe = plan.recipes.find((one) => one.key === key);
  const timing = plan.recipes.find((one) => one.key === "subtitles:timing");
  return requestHash("provided-review-v1", key, {
    recipe,
    dependencies: recipe?.dependsOn.map((dependency) =>
      plan.recipes.find((one) => one.key === dependency),
    ),
    timing:
      key === "subtitles:cues"
        ? timing?.input.kind === "local" && Array.isArray(timing.input.values)
          ? timing.input.values.slice(1)
          : null
        : null,
  });
}
export function applyProvidedReviews(
  db: DatabaseSync,
  revisionId: string,
  plan: RevisionWorkPlan,
): RevisionWorkPlan {
  const approved = new Set(
    db
      .prepare(
        "SELECT work_key,dependency_fingerprint FROM revision_provided_reviews WHERE revision_id=?",
      )
      .all(revisionId)
      .filter(
        (row) =>
          row.dependency_fingerprint === providedDependencyFingerprint(plan, String(row.work_key)),
      )
      .map((row) => String(row.work_key)),
  );
  return {
    ...plan,
    work: plan.work.map((row) =>
      approved.has(row.key) && row.disposition === "review"
        ? {
            ...row,
            disposition: row.kind === "provided" ? ("reuse" as const) : ("local" as const),
            reason: "Provided content was reviewed against these exact inputs.",
          }
        : row,
    ),
    providedReuseRequired: plan.providedReuseRequired.filter((key) => !approved.has(key)),
  };
}
