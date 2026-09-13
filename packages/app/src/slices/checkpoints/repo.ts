import type { DatabaseSync } from "node:sqlite";
import { transact } from "../../kernel/db/tx.js";
import type {
  CheckpointApprovalInput,
  CheckpointResult,
  CheckpointRow,
  CheckpointSetInput,
} from "./model.js";
import { checkpointApprovalSchema, checkpointRowSchema, checkpointSetSchema } from "./schema.js";

const select = `SELECT project_id AS projectId,revision_id AS revisionId,checkpoint_id AS checkpointId,
 stage,work_id AS workId,fingerprint,state,created_at AS createdAt,approved_at AS approvedAt
 FROM review_checkpoints`;

export function listCheckpoints(
  db: DatabaseSync,
  projectId: string,
  revisionId: string,
): readonly CheckpointRow[] {
  return db
    .prepare(`${select} WHERE project_id=? AND revision_id=? ORDER BY checkpoint_id`)
    .all(projectId, revisionId)
    .map((row) => checkpointRowSchema.parse(row));
}
export function checkpointForWork(db: DatabaseSync, workId: string): readonly CheckpointRow[] {
  return db
    .prepare(`${select} WHERE (project_id,revision_id) IN
    (SELECT project_id,revision_id FROM revision_work WHERE id=?) ORDER BY checkpoint_id`)
    .all(workId)
    .map((row) => checkpointRowSchema.parse(row));
}

export interface CheckpointClosureSettlement {
  readonly projectId: string;
  readonly revisionId: string;
  readonly checkpointId: string;
  readonly workKeys: readonly string[];
}

/**
 * Marks released checkpoints satisfied once every reservation in their exact
 * reviewed closure has reached a terminal state. Missing reservations keep a
 * checkpoint released: an incomplete materialization must never look complete.
 */
export function settleCheckpointClosures(
  db: DatabaseSync,
  closures: readonly CheckpointClosureSettlement[],
): readonly CheckpointRow[] {
  const settle = (): readonly CheckpointRow[] => {
    const satisfied: CheckpointRow[] = [];
    for (const closure of closures) {
      if (
        closure.workKeys.length === 0 ||
        new Set(closure.workKeys).size !== closure.workKeys.length
      )
        continue;
      const terminal = db.prepare(`SELECT 1 FROM revision_work_reservations r
        JOIN revision_work w ON w.id=r.work_id
        WHERE r.project_id=? AND r.revision_id=? AND r.work_key=?
        AND w.state IN ('done','failed','canceled')`);
      if (
        !closure.workKeys.every(
          (key) => terminal.get(closure.projectId, closure.revisionId, key) !== undefined,
        )
      )
        continue;
      const changed = db
        .prepare(`UPDATE review_checkpoints SET state='satisfied'
          WHERE project_id=? AND revision_id=? AND checkpoint_id=?
          AND state='released' AND approved_at IS NOT NULL`)
        .run(closure.projectId, closure.revisionId, closure.checkpointId);
      if (Number(changed.changes) !== 1) continue;
      const row = listCheckpoints(db, closure.projectId, closure.revisionId).find(
        (candidate) => candidate.checkpointId === closure.checkpointId,
      );
      if (row !== undefined) satisfied.push(row);
    }
    return satisfied;
  };
  return db.isTransaction ? settle() : transact(db, settle);
}
export function saveCheckpointSet(
  db: DatabaseSync,
  input: CheckpointSetInput,
): CheckpointResult<readonly CheckpointRow[]> {
  const parsed = checkpointSetSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid-input" };
  const value = parsed.data;
  return transact(db, () => {
    if (
      !db
        .prepare("SELECT 1 FROM project_revisions WHERE project_id=? AND id=?")
        .get(value.projectId, value.revisionId)
    )
      return { ok: false, reason: "not-found" };
    if (
      new Set(value.checkpoints.map((gate) => gate.checkpointId)).size !==
        value.checkpoints.length ||
      new Set(value.checkpoints.map((gate) => gate.stage)).size !== value.checkpoints.length
    )
      return { ok: false, reason: "duplicate" };
    const existing = listCheckpoints(db, value.projectId, value.revisionId);
    if (existing.length) {
      const same =
        existing.length === value.checkpoints.length &&
        existing.every((row) =>
          value.checkpoints.some(
            (gate) =>
              gate.checkpointId === row.checkpointId &&
              gate.stage === row.stage &&
              gate.workId === row.workId &&
              gate.fingerprint === row.fingerprint,
          ),
        );
      return same
        ? { ok: false, reason: "duplicate", value: existing }
        : { ok: false, reason: "conflict" };
    }
    for (const gate of value.checkpoints) {
      const work = db
        .prepare("SELECT project_id,revision_id,kind FROM revision_work WHERE id=?")
        .get(gate.workId);
      if (!work) return { ok: false, reason: "not-found" };
      if (
        work.project_id !== value.projectId ||
        work.revision_id !== value.revisionId ||
        work.kind !== gate.stage
      )
        return { ok: false, reason: "conflict" };
    }
    for (const gate of value.checkpoints)
      db.prepare(`INSERT INTO review_checkpoints(project_id,revision_id,checkpoint_id,stage,work_id,fingerprint,state,created_at)
        VALUES (?,?,?,?,?,?,?,?)`).run(
        value.projectId,
        value.revisionId,
        gate.checkpointId,
        gate.stage,
        gate.workId,
        gate.fingerprint,
        gate.state,
        value.createdAt,
      );
    return { ok: true, value: listCheckpoints(db, value.projectId, value.revisionId) };
  });
}
export function approveCheckpoint(
  db: DatabaseSync,
  input: CheckpointApprovalInput,
): CheckpointResult<CheckpointRow> {
  const parsed = checkpointApprovalSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid-input" };
  const value = parsed.data;
  return transact(db, () => {
    const receipt = db
      .prepare(
        "SELECT revision_id,checkpoint_id,fingerprint FROM review_checkpoint_approvals WHERE project_id=? AND idempotency_key=?",
      )
      .get(value.projectId, value.idempotencyKey);
    if (
      receipt &&
      (receipt.revision_id !== value.revisionId ||
        receipt.checkpoint_id !== value.checkpointId ||
        receipt.fingerprint !== value.fingerprint)
    )
      return { ok: false, reason: "conflict" };
    const row = listCheckpoints(db, value.projectId, value.revisionId).find(
      (gate) => gate.checkpointId === value.checkpointId,
    );
    if (!row) return { ok: false, reason: "not-found" };
    const head = db
      .prepare("SELECT revision_id FROM project_heads WHERE project_id=?")
      .get(value.projectId);
    if (head?.revision_id !== value.revisionId || row.fingerprint !== value.fingerprint)
      return { ok: false, reason: "conflict" };
    if (row.state === "released" || (row.state === "satisfied" && receipt))
      return { ok: false, reason: "duplicate", value: row };
    if (receipt) return { ok: false, reason: "conflict" };
    if (row.state !== "held" && row.state !== "pending-review")
      return { ok: false, reason: "conflict" };
    const changed = db
      .prepare(`UPDATE review_checkpoints SET state='released',approved_at=?
      WHERE project_id=? AND revision_id=? AND checkpoint_id=? AND fingerprint=? AND state=?`)
      .run(
        value.approvedAt,
        value.projectId,
        value.revisionId,
        value.checkpointId,
        value.fingerprint,
        row.state,
      );
    if (Number(changed.changes) !== 1) return { ok: false, reason: "conflict" };
    db.prepare(`INSERT INTO review_checkpoint_approvals(project_id,idempotency_key,revision_id,checkpoint_id,fingerprint,approved_at)
      VALUES (?,?,?,?,?,?)`).run(
      value.projectId,
      value.idempotencyKey,
      value.revisionId,
      value.checkpointId,
      value.fingerprint,
      value.approvedAt,
    );
    return { ok: true, value: { ...row, state: "released", approvedAt: value.approvedAt } };
  });
}
