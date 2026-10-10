import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { transact } from "../../kernel/db/tx.js";
import { liveProject, projectTrashed } from "../admission/repo.js";
import { type Actor, actors } from "../agents/model.js";
import {
  type ExternalAnswerResult,
  type ExternalReview,
  externalReviewStates,
  type SettledReview,
} from "./external-model.js";
import { type ReviewVerdict, reviewStages } from "./model.js";

const materialSchema = z.object({
  request: z.object({
    stage: z.enum(reviewStages),
    instruction: z.string(),
    sections: z.array(z.object({ label: z.string(), text: z.string() })),
    images: z.array(z.string()),
  }),
  images: z.array(z.object({ stored: z.string(), name: z.string() })),
});
const verdictSchema = z.object({ passed: z.boolean(), reasons: z.array(z.string()) });
const rowSchema = z.object({
  id: z.string(),
  project_id: z.string(),
  revision_id: z.string(),
  work_id: z.string(),
  piece_id: z.string(),
  work_key: z.string(),
  item_key: z.string(),
  stage: z.enum(reviewStages),
  item_fingerprint: z.string(),
  review_fingerprint: z.string(),
  material: z.string(),
  state: z.enum(externalReviewStates),
  waiting_since: z.string(),
  deadline_at: z.string(),
  verdict: z.string().nullable(),
  answered_by: z.enum(actors).nullable(),
  answered_at: z.string().nullable(),
});

// One stored review as the slice speaks of it; throws for a row that can't be read back.
export function externalReviewOf(value: unknown): ExternalReview {
  const row = rowSchema.parse(value);
  return {
    id: row.id,
    projectId: row.project_id,
    revisionId: row.revision_id,
    workId: row.work_id,
    pieceId: row.piece_id,
    workKey: row.work_key,
    itemKey: row.item_key,
    stage: row.stage,
    itemFingerprint: row.item_fingerprint,
    reviewFingerprint: row.review_fingerprint,
    material: materialSchema.parse(JSON.parse(row.material)),
    state: row.state,
    waitingSince: row.waiting_since,
    deadlineAt: row.deadline_at,
    verdict: row.verdict === null ? null : verdictSchema.parse(JSON.parse(row.verdict)),
    answeredBy: row.answered_by,
    answeredAt: row.answered_at,
  };
}

// A review the project still wants: its step is reserved by the project's current version with
// the same fingerprint. A rerun or an edit that replaced the item leaves it unwanted.
function wantedBy(table: string): string {
  return `EXISTS (SELECT 1 FROM revision_work_reservations r
    JOIN project_heads h ON h.project_id=r.project_id AND h.revision_id=r.revision_id
    WHERE r.project_id=${table}.project_id AND r.work_id=${table}.work_id
      AND r.work_key=${table}.work_key AND r.fingerprint=${table}.review_fingerprint)`;
}

// Nothing of a canceled run goes ahead on its own.
function liveWork(table: string): string {
  return `EXISTS (SELECT 1 FROM revision_work w WHERE w.id=${table}.work_id AND w.state!='canceled')`;
}

// A step asked again for the same review keeps its row; one whose earlier wait was superseded
// waits again from now.
export function openExternalReview(
  db: DatabaseSync,
  input: Omit<ExternalReview, "state" | "verdict" | "answeredBy" | "answeredAt">,
): ExternalReview {
  db.prepare(
    `INSERT INTO external_reviews(id,project_id,revision_id,work_id,piece_id,work_key,item_key,stage,item_fingerprint,review_fingerprint,material,state,waiting_since,deadline_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,'waiting',?,?)
     ON CONFLICT(project_id,review_fingerprint) DO UPDATE SET revision_id=excluded.revision_id,
       work_id=excluded.work_id,piece_id=excluded.piece_id,work_key=excluded.work_key,
       item_fingerprint=excluded.item_fingerprint,material=excluded.material,state='waiting',
       waiting_since=excluded.waiting_since,deadline_at=excluded.deadline_at,verdict=NULL,
       answered_by=NULL,answered_at=NULL
     WHERE external_reviews.state='superseded'`,
  ).run(
    input.id,
    input.projectId,
    input.revisionId,
    input.workId,
    input.pieceId,
    input.workKey,
    input.itemKey,
    input.stage,
    input.itemFingerprint,
    input.reviewFingerprint,
    JSON.stringify(input.material),
    input.waitingSince,
    input.deadlineAt,
  );
  const saved = externalReviewByFingerprint(db, input.projectId, input.reviewFingerprint);
  if (saved === undefined)
    throw new Error(
      "Slopify hit an internal error (an external review could not be saved). Retry stage; if it happens again, use Download diagnostics in Settings and report it.",
    );
  return saved;
}

export function externalReviewByFingerprint(
  db: DatabaseSync,
  projectId: string,
  reviewFingerprint: string,
): ExternalReview | undefined {
  const row = db
    .prepare("SELECT * FROM external_reviews WHERE project_id=? AND review_fingerprint=?")
    .get(projectId, reviewFingerprint);
  return row === undefined ? undefined : externalReviewOf(row);
}

export function externalReviewById(
  db: DatabaseSync,
  projectId: string,
  id: string,
): ExternalReview | undefined {
  const row = db
    .prepare("SELECT * FROM external_reviews WHERE project_id=? AND id=?")
    .get(projectId, id);
  return row === undefined ? undefined : externalReviewOf(row);
}

// The step that waited ended its stage as held, which parks the work (`finishWork`); a settled
// review lets it be claimed again while the current version still wants it. A restart also
// held the work's unfinished pieces (`recoverWork`), so the ones never submitted are allowed
// again, as boot does for work it keeps (`recoverCheckpointWork`). A paused project stays put:
// the runner claims nothing for it until Resume.
function releaseParkedWork(db: DatabaseSync, projectId: string, id: string): void {
  const parked = `(SELECT e.work_id FROM external_reviews e WHERE e.project_id=? AND e.id=? AND ${wantedBy("e")})`;
  const released = db
    .prepare(
      `UPDATE revision_work SET dispatch_state='allowed' WHERE state='pending' AND dispatch_state='held' AND id=${parked}`,
    )
    .run(projectId, id);
  if (Number(released.changes) === 0) return;
  db.prepare(
    `UPDATE revision_work_pieces SET state='pending',dispatch_state='allowed'
     WHERE work_id=${parked} AND state='held' AND submitted_at IS NULL AND continuation IS NULL`,
  ).run(projectId, id);
}

// The first verdict saved wins: one guarded UPDATE, so two agents answering at once cannot
// both succeed. A review whose item was just replaced is superseded here rather than at the
// next settle, a project in the Trash takes no verdict until it is restored, and a canceled
// run's review takes none at all.
export function answerExternalReview(
  db: DatabaseSync,
  input: {
    readonly projectId: string;
    readonly id: string;
    readonly verdict: ReviewVerdict;
    readonly by: Actor;
    readonly at: string;
  },
): ExternalAnswerResult {
  if (projectTrashed(db, input.projectId))
    return externalReviewById(db, input.projectId, input.id) === undefined
      ? { ok: false, reason: "not-found" }
      : { ok: false, reason: "trashed" };
  const changed = transact(db, () => {
    db.prepare(
      `UPDATE external_reviews SET state='superseded' WHERE project_id=? AND id=? AND state='waiting' AND NOT ${wantedBy("external_reviews")}`,
    ).run(input.projectId, input.id);
    const answered = db
      .prepare(
        `UPDATE external_reviews SET state='answered', verdict=?, answered_by=?, answered_at=? WHERE project_id=? AND id=? AND state='waiting' AND ${wantedBy("external_reviews")} AND ${liveWork("external_reviews")}`,
      )
      .run(JSON.stringify(input.verdict), input.by, input.at, input.projectId, input.id);
    if (Number(answered.changes) === 1) releaseParkedWork(db, input.projectId, input.id);
    return answered;
  });
  const row = externalReviewById(db, input.projectId, input.id);
  if (row === undefined) return { ok: false, reason: "not-found" };
  if (Number(changed.changes) === 1) return { ok: true, value: row };
  const reason =
    row.state === "superseded" ? "superseded" : row.state === "waiting" ? "canceled" : "answered";
  return { ok: false, reason, value: row };
}

// Waiting, still wanted by the current version, of a run that isn't canceled, oldest first.
export function waitingExternalReviews(
  db: DatabaseSync,
  projectId?: string,
): readonly ExternalReview[] {
  return waitingExternalReviewRows(db, projectId).map(externalReviewOf);
}

// The same rows unread, for a caller that skips one it can't read instead of failing them all.
export function waitingExternalReviewRows(db: DatabaseSync, projectId?: string): unknown[] {
  return db
    .prepare(
      `SELECT e.* FROM external_reviews e WHERE ${stillWaiting(projectId)} ORDER BY e.waiting_since, e.rowid`,
    )
    .all(...(projectId === undefined ? [] : [projectId]));
}

// The projects with a review waiting for an agent, as `waitingExternalReviewRows` finds them.
export function projectsWaitingOnAgents(db: DatabaseSync, projectId?: string): ReadonlySet<string> {
  const rows = db
    .prepare(
      `SELECT DISTINCT e.project_id FROM external_reviews e WHERE ${stillWaiting(projectId)}`,
    )
    .all(...(projectId === undefined ? [] : [projectId]));
  return new Set(rows.map((row) => z.string().parse(row.project_id)));
}

// A review `e` that waits: still wanted, of a run that isn't canceled and a project not in the
// Trash; one project's alone when `projectId` is given (bound as the query's parameter).
function stillWaiting(projectId: string | undefined): string {
  return `e.state='waiting' AND ${wantedBy("e")} AND ${liveWork("e")} AND ${liveProject("e", "project_id")}${
    projectId === undefined ? "" : " AND e.project_id=?"
  }`;
}

const dueRow = z.object({
  id: z.string(),
  project_id: z.string(),
  revision_id: z.string(),
  work_id: z.string(),
  stage: z.enum(reviewStages),
  item_key: z.string(),
});

// Replaced reviews stop waiting; waiting ones past their deadline pass without review. A
// paused project's review passes too (nothing runs until Resume); a canceled run's never does,
// nor one of a project in the Trash (it waits on, and passes once restored).
// Read by plain columns only: a review whose stored material can't be read back still passes,
// and never holds up the others.
export function settleExternalReviews(db: DatabaseSync, now: Date): readonly SettledReview[] {
  const at = now.toISOString();
  return transact(db, () => {
    db.prepare(
      `UPDATE external_reviews SET state='superseded' WHERE state='waiting' AND NOT ${wantedBy("external_reviews")}`,
    ).run();
    const due = db
      .prepare(
        `SELECT e.id, e.project_id, e.revision_id, e.work_id, e.stage, e.item_key FROM external_reviews e
         WHERE e.state='waiting' AND e.deadline_at<=? AND ${liveWork("e")} AND ${liveProject("e", "project_id")}
         ORDER BY e.waiting_since, e.rowid`,
      )
      .all(at)
      .map((value) => dueRow.parse(value));
    return due.map((row) => {
      db.prepare(
        "UPDATE external_reviews SET state='auto-passed', answered_at=? WHERE id=? AND state='waiting'",
      ).run(at, row.id);
      releaseParkedWork(db, row.project_id, row.id);
      return {
        id: row.id,
        projectId: row.project_id,
        revisionId: row.revision_id,
        workId: row.work_id,
        stage: row.stage,
        itemKey: row.item_key,
      };
    });
  });
}
