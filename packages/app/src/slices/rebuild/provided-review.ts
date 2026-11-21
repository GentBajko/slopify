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
// The reviews of provided content saved for a version: each step's key and the inputs it was
// reviewed against.
export interface ProvidedReview {
  readonly workKey: string;
  readonly dependencyFingerprint: unknown;
}
export function providedReviews(db: DatabaseSync, revisionId: string): readonly ProvidedReview[] {
  return db
    .prepare(
      "SELECT work_key,dependency_fingerprint FROM revision_provided_reviews WHERE revision_id=?",
    )
    .all(revisionId)
    .map((row) => ({
      workKey: String(row.work_key),
      dependencyFingerprint: row.dependency_fingerprint,
    }));
}
export function applyProvidedReviews(
  db: DatabaseSync,
  revisionId: string,
  plan: RevisionWorkPlan,
): RevisionWorkPlan {
  return applyReviews(providedReviews(db, revisionId), plan);
}
export function applyReviews(
  reviews: readonly ProvidedReview[],
  plan: RevisionWorkPlan,
): RevisionWorkPlan {
  const approved = new Set(
    reviews
      .filter(
        (row) => row.dependencyFingerprint === providedDependencyFingerprint(plan, row.workKey),
      )
      .map((row) => row.workKey),
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
