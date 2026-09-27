import type { DatabaseSync } from "node:sqlite";
import type { StageState } from "../pipeline.js";
import type { WorkRef } from "./work.js";

export function workExists(db: DatabaseSync, work: WorkRef): boolean {
  return (
    db
      .prepare(
        `SELECT 1 FROM revision_work WHERE id=? AND project_id=? AND revision_id=? AND stage_id=? AND kind=? AND fingerprint=?`,
      )
      .get(
        work.workId,
        work.projectId,
        work.revisionId,
        work.stageId,
        work.kind,
        work.fingerprint,
      ) !== undefined
  );
}
export function claimWork(db: DatabaseSync, work: WorkRef): boolean {
  return (
    db
      .prepare(
        `UPDATE revision_work SET state='running',progress_current=NULL,progress_total=NULL WHERE id=? AND project_id=? AND revision_id=? AND stage_id=? AND kind=? AND fingerprint=? AND state='pending' AND dispatch_state='allowed'`,
      )
      .run(work.workId, work.projectId, work.revisionId, work.stageId, work.kind, work.fingerprint)
      .changes === 1
  );
}
export function maySubmit(db: DatabaseSync, work: WorkRef, pieceId?: string): boolean {
  if (!workExists(db, work)) return false;
  const allowed =
    db
      .prepare(
        `SELECT 1 FROM revision_work WHERE id=? AND state IN ('pending','running') AND dispatch_state='allowed'`,
      )
      .get(work.workId) !== undefined;
  if (!allowed || !ownsCurrentWork(db, work, pieceId ?? null)) return false;
  return (
    pieceId === undefined ||
    db
      .prepare(
        `SELECT 1 FROM revision_work_pieces WHERE id=? AND work_id=? AND dispatch_state='allowed' AND state IN ('pending','running')`,
      )
      .get(pieceId, work.workId) !== undefined
  );
}
export function ownsCurrentWork(db: DatabaseSync, work: WorkRef, pieceId: string | null): boolean {
  if (!workExists(db, work)) return false;
  return (
    db
      .prepare(
        `SELECT 1 FROM revision_work_reservations r JOIN project_heads h ON h.project_id=r.project_id AND h.revision_id=r.revision_id JOIN project_revisions v ON v.id=r.revision_id JOIN json_each(v.fingerprints) f ON f.key=COALESCE(r.logical_key,r.work_key) AND f.value=COALESCE(r.desired_fingerprint,r.fingerprint) WHERE r.project_id=? AND r.work_id=? AND r.piece_id IS ? AND (r.piece_id IS NULL OR EXISTS(SELECT 1 FROM revision_work_pieces p WHERE p.id=r.piece_id AND p.work_id=r.work_id AND p.work_key=r.work_key AND p.fingerprint=r.fingerprint))`,
      )
      .get(work.projectId, work.workId, pieceId) !== undefined
  );
}
export function finishWork(
  db: DatabaseSync,
  work: WorkRef,
  state: StageState,
  reason: string | null,
  kind: string | null = null,
): void {
  if (!workExists(db, work)) return;
  const normalized = state === "provided" || state === "skipped" ? "done" : state;
  db.prepare(
    `UPDATE revision_work SET state=?,failure_reason=?,failure_kind=?,retry_at=NULL,dispatch_state=CASE WHEN ?='pending' THEN 'held' ELSE dispatch_state END WHERE id=?`,
  ).run(normalized, reason, normalized === "failed" ? kind : null, normalized, work.workId);
}

// How many times the automatic retry already put this step back to wait.
export function autoRetriesOf(db: DatabaseSync, work: WorkRef): number {
  const row = db.prepare("SELECT auto_retries FROM revision_work WHERE id=?").get(work.workId);
  return typeof row?.auto_retries === "number" ? row.auto_retries : 0;
}

// A running step that failed on something time can fix goes back to `pending` with the time
// it may start again. It stays dispatchable, unlike a paused one, and its unfinished pieces
// may be sent again: the failure that ended them was not a lost submission.
export function deferWork(
  db: DatabaseSync,
  work: WorkRef,
  at: string,
  reason: string,
  kind: string,
): boolean {
  if (!workExists(db, work)) return false;
  const moved =
    db
      .prepare(
        `UPDATE revision_work SET state='pending',retry_at=?,auto_retries=auto_retries+1,failure_reason=?,failure_kind=? WHERE id=? AND state='running' AND dispatch_state='allowed'`,
      )
      .run(at, reason, kind, work.workId).changes === 1;
  if (moved)
    db.prepare(
      "UPDATE revision_work_pieces SET state='pending' WHERE work_id=? AND state IN ('failed','running')",
    ).run(work.workId);
  return moved;
}

// The projects with a wait that has run out, their wait cleared so the next tick may claim
// them. A paused project keeps its wait: Resume ticks it, and nothing else should.
export function dueRetries(db: DatabaseSync, now: string): readonly string[] {
  const rows = db
    .prepare(
      `UPDATE revision_work SET retry_at=NULL WHERE state='pending' AND retry_at IS NOT NULL AND retry_at<=? AND NOT EXISTS(SELECT 1 FROM project_controls c WHERE c.project_id=revision_work.project_id AND c.paused=1) RETURNING project_id`,
    )
    .all(now);
  return [...new Set(rows.map((row) => String(row.project_id)))];
}
