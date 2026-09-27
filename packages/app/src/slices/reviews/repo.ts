import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { type ReviewRecord, reviewStages } from "./model.js";

const rowSchema = z.object({
  id: z.string(),
  project_id: z.string(),
  revision_id: z.string(),
  item_key: z.string(),
  stage: z.enum(reviewStages),
  item_fingerprint: z.string(),
  review_fingerprint: z.string(),
  passed: z.number(),
  reasons: z.string(),
  outcome: z.enum(["passed", "flagged", "redo"]),
  attempt: z.number().int(),
  action: z.enum(["overruled", "redone"]).nullable(),
  action_at: z.string().nullable(),
  redo_state: z.enum(["pending", "started", "failed"]).nullable(),
  redo_error: z.string().nullable(),
  created_at: z.string(),
});

function recordOf(value: unknown): ReviewRecord {
  const row = rowSchema.parse(value);
  return {
    id: row.id,
    projectId: row.project_id,
    revisionId: row.revision_id,
    itemKey: row.item_key,
    stage: row.stage,
    itemFingerprint: row.item_fingerprint,
    reviewFingerprint: row.review_fingerprint,
    passed: row.passed === 1,
    reasons: z.array(z.string()).parse(JSON.parse(row.reasons)),
    outcome: row.outcome,
    attempt: row.attempt,
    action: row.action,
    actionAt: row.action_at,
    redoState: row.redo_state,
    redoError: row.redo_error,
    createdAt: row.created_at,
  };
}

// One verdict per review step: the same review asked again (a retried step whose answer was
// saved but not published) replaces the earlier answer rather than adding a second one.
export function saveVerdict(db: DatabaseSync, record: ReviewRecord): ReviewRecord {
  db.prepare(
    `INSERT INTO review_verdicts(id,project_id,revision_id,item_key,stage,item_fingerprint,review_fingerprint,passed,reasons,outcome,attempt,action,action_at,redo_state,redo_error,created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(project_id,review_fingerprint) DO UPDATE SET revision_id=excluded.revision_id,
       item_fingerprint=excluded.item_fingerprint,passed=excluded.passed,reasons=excluded.reasons,
       outcome=excluded.outcome,attempt=excluded.attempt,action=NULL,action_at=NULL,
       redo_state=excluded.redo_state,redo_error=NULL,created_at=excluded.created_at`,
  ).run(
    record.id,
    record.projectId,
    record.revisionId,
    record.itemKey,
    record.stage,
    record.itemFingerprint,
    record.reviewFingerprint,
    record.passed ? 1 : 0,
    JSON.stringify(record.reasons),
    record.outcome,
    record.attempt,
    record.action,
    record.actionAt,
    record.redoState,
    record.redoError,
    record.createdAt,
  );
  const saved = verdictByReview(db, record.projectId, record.reviewFingerprint);
  if (saved === undefined)
    throw new Error(
      "Slopify hit an internal error (a review's verdict could not be saved). Try again; if it happens again, use Download diagnostics in Settings and report it.",
    );
  return saved;
}

export function verdictByReview(
  db: DatabaseSync,
  projectId: string,
  reviewFingerprint: string,
): ReviewRecord | undefined {
  const row = db
    .prepare("SELECT * FROM review_verdicts WHERE project_id=? AND review_fingerprint=?")
    .get(projectId, reviewFingerprint);
  return row === undefined ? undefined : recordOf(row);
}

export function verdictById(
  db: DatabaseSync,
  projectId: string,
  id: string,
): ReviewRecord | undefined {
  const row = db
    .prepare("SELECT * FROM review_verdicts WHERE project_id=? AND id=?")
    .get(projectId, id);
  return row === undefined ? undefined : recordOf(row);
}

export function latestVerdict(
  db: DatabaseSync,
  projectId: string,
  itemKey: string,
): ReviewRecord | undefined {
  const row = db
    .prepare(
      "SELECT * FROM review_verdicts WHERE project_id=? AND item_key=? ORDER BY created_at DESC, rowid DESC LIMIT 1",
    )
    .get(projectId, itemKey);
  return row === undefined ? undefined : recordOf(row);
}

// Newest first: the project page shows each item's latest verdict and keeps the rest as its
// history.
export function listVerdicts(db: DatabaseSync, projectId: string): readonly ReviewRecord[] {
  return db
    .prepare(
      "SELECT * FROM review_verdicts WHERE project_id=? ORDER BY created_at DESC, rowid DESC",
    )
    .all(projectId)
    .map(recordOf);
}

export function pendingRedos(db: DatabaseSync, projectId?: string): readonly ReviewRecord[] {
  return (
    projectId === undefined
      ? db.prepare("SELECT * FROM review_verdicts WHERE redo_state='pending' ORDER BY rowid").all()
      : db
          .prepare(
            "SELECT * FROM review_verdicts WHERE redo_state='pending' AND project_id=? ORDER BY rowid",
          )
          .all(projectId)
  ).map(recordOf);
}

export function setRedoState(
  db: DatabaseSync,
  id: string,
  state: "started" | "failed",
  error: string | null = null,
): void {
  db.prepare("UPDATE review_verdicts SET redo_state=?, redo_error=? WHERE id=?").run(
    state,
    error,
    id,
  );
}

export type VerdictActionResult =
  | { readonly ok: true; readonly value: ReviewRecord }
  | { readonly ok: false; readonly reason: "not-found" | "conflict" };

// Overrule accepts a failed item as it is; Redo records that the person had it made again.
// A passed verdict has nothing to overrule, and an automatic redo already under way owns the
// item until it lands.
export function actOnVerdict(
  db: DatabaseSync,
  projectId: string,
  id: string,
  action: "overruled" | "redone",
  at: string,
): VerdictActionResult {
  const record = verdictById(db, projectId, id);
  if (record === undefined) return { ok: false, reason: "not-found" };
  if (action === "overruled" && record.passed) return { ok: false, reason: "conflict" };
  if (record.redoState === "pending" || record.redoState === "started")
    return { ok: false, reason: "conflict" };
  db.prepare("UPDATE review_verdicts SET action=?, action_at=? WHERE id=?").run(action, at, id);
  const updated = verdictById(db, projectId, id);
  return updated === undefined ? { ok: false, reason: "not-found" } : { ok: true, value: updated };
}
