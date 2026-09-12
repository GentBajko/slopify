import type { DatabaseSync } from "node:sqlite";
import { transact } from "../db/tx.js";
import type { Ids } from "../ids.js";
import type { AttemptStart } from "./attempt-repo.js";
import type { AttemptResult, WorkRef } from "./work.js";
import { maySubmit, ownsCurrentWork, workExists } from "./work-authority.js";
export function startWorkAttempt(
  db: DatabaseSync,
  ids: Ids,
  input: AttemptStart,
  work: WorkRef,
  pieceId: string | null,
  operation: "submit" | "retrieve" = "submit",
): AttemptResult<string> {
  return transact(db, () => {
    if (input.stageId !== work.stageId || !workExists(db, work))
      return { ok: false, reason: "held" };
    if (operation === "retrieve") {
      if (pieceId === null || readWorkContinuation(db, work, pieceId) === null)
        return { ok: false, reason: "held" };
      const submitted = db
        .prepare(
          "SELECT id FROM attempts WHERE work_id=? AND work_piece_id=? ORDER BY rowid DESC LIMIT 1",
        )
        .get(work.workId, pieceId);
      return typeof submitted?.id === "string"
        ? { ok: true, value: submitted.id }
        : { ok: false, reason: "held" };
    } else if (
      !maySubmit(db, work, pieceId ?? undefined) ||
      (pieceId !== null && readWorkContinuation(db, work, pieceId) !== null)
    )
      return { ok: false, reason: "held" };
    const id = ids.next();
    db.prepare(
      `INSERT INTO attempts(id,stage_id,piece_id,n,started_at,revision_id,work_id,work_piece_id) VALUES (?,?,?,?,?,?,?,?)`,
    ).run(id, work.stageId, null, input.n, input.startedAt, work.revisionId, work.workId, pieceId);
    if (operation === "submit") {
      if (pieceId !== null)
        db.prepare(
          `UPDATE revision_work_pieces SET submitted_at=COALESCE(submitted_at,?),state='running' WHERE id=? AND work_id=?`,
        ).run(input.startedAt, pieceId, work.workId);
      if (ownsCurrentWork(db, work, pieceId))
        db.prepare("UPDATE stages SET attempt_count=? WHERE id=?").run(input.n, work.stageId);
    }
    return { ok: true, value: id };
  });
}
export function readWorkContinuation(
  db: DatabaseSync,
  work: WorkRef,
  pieceId: string,
): string | null {
  if (!workExists(db, work)) return null;
  const row = db
    .prepare(
      "SELECT continuation FROM revision_work_pieces WHERE id=? AND work_id=? AND submitted_at IS NOT NULL",
    )
    .get(pieceId, work.workId);
  // A malformed persisted token still records an accepted operation. Let the adapter
  // reject it rather than turning corruption into another paid submission.
  return typeof row?.continuation === "string" ? row.continuation : null;
}
export function writeWorkContinuation(
  db: DatabaseSync,
  work: WorkRef,
  pieceId: string,
  continuation: string,
): boolean {
  if (!workExists(db, work) || continuation.length === 0) return false;
  return (
    db
      .prepare(
        `UPDATE revision_work_pieces SET continuation=? WHERE id=? AND work_id=? AND submitted_at IS NOT NULL AND (continuation IS NULL OR continuation=?)`,
      )
      .run(continuation, pieceId, work.workId, continuation).changes === 1
  );
}
