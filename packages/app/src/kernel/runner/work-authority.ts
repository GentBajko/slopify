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
        `UPDATE revision_work SET state='running' WHERE id=? AND project_id=? AND revision_id=? AND stage_id=? AND kind=? AND fingerprint=? AND state='pending' AND dispatch_state='allowed'`,
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
): void {
  if (!workExists(db, work)) return;
  const normalized = state === "provided" || state === "skipped" ? "done" : state;
  db.prepare(`UPDATE revision_work SET state=?,failure_reason=? WHERE id=?`).run(
    normalized,
    reason,
    work.workId,
  );
}
