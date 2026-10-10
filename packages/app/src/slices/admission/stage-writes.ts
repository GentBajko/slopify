import type { DatabaseSync } from "node:sqlite";
import type { Stage } from "./model.js";

export function insertStage(db: DatabaseSync, stage: Stage): void {
  db.prepare(
    "INSERT INTO stages (id, project_id, kind, source, state, attempt_count) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(stage.id, stage.projectId, stage.kind, stage.source, stage.state, stage.attemptCount);
}

// The runner's claim: one statement, so two callers cannot both find the stage pending.
export function claimStage(db: DatabaseSync, stageId: string, at: string): boolean {
  const result = db
    .prepare(
      "UPDATE stages SET state = 'running', started_at = ?, finished_at = NULL, failure_reason = NULL WHERE id = ? AND state = 'pending' AND NOT EXISTS (SELECT 1 FROM project_controls WHERE project_id = stages.project_id AND paused = 1)",
    )
    .run(at, stageId);
  return Number(result.changes) === 1;
}

export function finishStage(
  db: DatabaseSync,
  stageId: string,
  state: Stage["state"],
  failureReason: string | null,
  at: string,
): void {
  db.prepare(
    "UPDATE stages SET state = ?, failure_reason = ?, retry_at = NULL, finished_at = ? WHERE id = ?",
  ).run(state, failureReason, state === "pending" ? null : at, stageId);
}

// A stage put back to `pending` by a re-run, a cascade or a retry starts again from a clean row
// - no error text, no progress from the run before it, and a fresh attempt budget.
export function resetStage(db: DatabaseSync, stageId: string): void {
  db.prepare(
    "UPDATE stages SET state = 'pending', failure_reason = NULL, failure_kind = NULL, retry_at = NULL, attempt_count = 0, progress_current = NULL, progress_total = NULL, started_at = NULL, finished_at = NULL WHERE id = ?",
  ).run(stageId);
}

export function setStageProgress(
  db: DatabaseSync,
  stageId: string,
  current: number,
  total: number,
): void {
  db.prepare("UPDATE stages SET progress_current = ?, progress_total = ? WHERE id = ?").run(
    current,
    total,
    stageId,
  );
}
