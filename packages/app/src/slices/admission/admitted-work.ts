import type { DatabaseSync } from "node:sqlite";

// A step `w` a run admitted (`recipe_context`) for its project's current version, of a stage not
// finished: it still has to run, though a restart, a pause or an agent's review held it, and
// Continue the run or the agent's answer starts it again. A saved edit's step nobody admitted
// yet has no `recipe_context`, and a step reserved only by an older version is a leftover.
export function admittedUnfinished(w: string): string {
  return `${w}.recipe_context IS NOT NULL
    AND EXISTS (SELECT 1 FROM stages s WHERE s.project_id=${w}.project_id AND s.id=${w}.stage_id
      AND s.state NOT IN ('done','provided','skipped'))
    AND EXISTS (SELECT 1 FROM revision_work_reservations r
      JOIN project_heads h ON h.project_id=r.project_id AND h.revision_id=r.revision_id
      WHERE r.work_id=${w}.id)`;
}

// Work `w` admitted and waiting to run (`admittedUnfinished`), as Retry, Resume or Continue
// leave a canceled run's step.
export function pendingAdmitted(w: string): string {
  return `${w}.state='pending' AND ${admittedUnfinished(w)}`;
}

// Whether stage `s` has work admitted (`admittedUnfinished`) in the stage's own state: the
// fact `derive` reads (`readmitted`) to tell a stage taken up again after a cancel.
export function admittedInItsState(s: string): string {
  return `EXISTS (SELECT 1 FROM revision_work w WHERE w.project_id=${s}.project_id AND w.stage_id=${s}.id
      AND w.state=${s}.state AND ${admittedUnfinished("w")})`;
}

// The same fact for a project's work, as `${kind}:${state}` of each step admitted, for a caller
// that derives stage states from the work itself (`rebuild/runtime-store.ts`).
export function admittedStates(db: DatabaseSync, projectId: string): ReadonlySet<string> {
  return new Set(
    db
      .prepare(
        `SELECT DISTINCT w.kind, w.state FROM revision_work w WHERE w.project_id=? AND ${admittedUnfinished("w")}`,
      )
      .all(projectId)
      .map((row) => `${String(row.kind)}:${String(row.state)}`),
  );
}

// Whether stage `s` is parked on a review someone answers, so it can still move on: work of it
// waits for an External agent's review, or a checkpoint of the current version on its stage is
// not approved yet (the person's, or a schedule's own hold for its day). `derive` reads it
// beside a failed stage.
export function parkedOnReview(s: string): string {
  return `(EXISTS (SELECT 1 FROM revision_work w JOIN external_reviews e ON e.work_id=w.id
      WHERE w.project_id=${s}.project_id AND w.stage_id=${s}.id AND e.state='waiting'
        AND ${pendingAdmitted("w")})
    OR EXISTS (SELECT 1 FROM review_checkpoints c
      JOIN project_heads h ON h.project_id=c.project_id AND h.revision_id=c.revision_id
      WHERE c.project_id=${s}.project_id AND c.stage=${s}.kind
        AND c.state IN ('held','pending-review') AND c.approved_at IS NULL))`;
}

// The same fact for each stage of a project, by kind, for the runner's own standings.
export function parkedKinds(db: DatabaseSync, projectId: string): ReadonlySet<string> {
  return new Set(
    db
      .prepare(`SELECT s.kind FROM stages s WHERE s.project_id=? AND ${parkedOnReview("s")}`)
      .all(projectId)
      .map((row) => String(row.kind)),
  );
}
