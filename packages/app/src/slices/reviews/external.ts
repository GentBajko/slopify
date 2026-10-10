import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { transact } from "../../kernel/db/tx.js";
import { causedBy } from "../../kernel/errors.js";
import type { ProjectEvent } from "../../kernel/events.js";
import type { Log } from "../../kernel/log.js";
import { liveProject, projectTrashed } from "../admission/repo.js";
import { type Actor, actors } from "../agents/model.js";
import { reviewItemName } from "../notifications/rules.js";
import { revisionById } from "../revisions/repo.js";
import { type ReviewStage, type ReviewVerdict, reviewStages } from "./model.js";
import type { ReviewMaterial } from "./verdict.js";

// ceiling: the owner's number. An hourly agent routine answers well inside two hours; a run
// with no agent at all still finishes the same evening.
export const externalReviewWaitMs = 2 * 60 * 60 * 1000;

export const externalReviewStates = ["waiting", "answered", "auto-passed", "superseded"] as const;
export type ExternalReviewState = (typeof externalReviewStates)[number];

// What the built-in reviewer would be sent: the prompt's parts, and the pictures by their stored
// path (`storage/layout.ts` outputPath finds where each is when it is read).
export interface ExternalMaterial {
  readonly request: ReviewMaterial;
  readonly images: readonly { readonly stored: string; readonly name: string }[];
}

export interface ExternalReview {
  readonly id: string;
  readonly projectId: string;
  readonly revisionId: string;
  readonly workId: string;
  readonly pieceId: string;
  readonly workKey: string;
  readonly itemKey: string;
  readonly stage: ReviewStage;
  readonly itemFingerprint: string;
  readonly reviewFingerprint: string;
  readonly material: ExternalMaterial;
  readonly state: ExternalReviewState;
  readonly waitingSince: string;
  readonly deadlineAt: string;
  readonly verdict: ReviewVerdict | null;
  readonly answeredBy: Actor | null;
  readonly answeredAt: string | null;
}

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
export function wantedBy(table: string): string {
  return `EXISTS (SELECT 1 FROM revision_work_reservations r
    JOIN project_heads h ON h.project_id=r.project_id AND h.revision_id=r.revision_id
    WHERE r.project_id=${table}.project_id AND r.work_id=${table}.work_id
      AND r.work_key=${table}.work_key AND r.fingerprint=${table}.review_fingerprint)`;
}

// Nothing of a canceled run goes ahead on its own.
export function liveWork(table: string): string {
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

export type ExternalAnswerResult =
  | { readonly ok: true; readonly value: ExternalReview }
  | { readonly ok: false; readonly reason: "not-found" }
  | { readonly ok: false; readonly reason: "trashed" }
  | {
      readonly ok: false;
      readonly reason: "answered" | "superseded";
      readonly value: ExternalReview;
    };

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
// next settle, and a project in the Trash takes no verdict until it is restored.
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
        `UPDATE external_reviews SET state='answered', verdict=?, answered_by=?, answered_at=? WHERE project_id=? AND id=? AND state='waiting' AND ${wantedBy("external_reviews")}`,
      )
      .run(JSON.stringify(input.verdict), input.by, input.at, input.projectId, input.id);
    if (Number(answered.changes) === 1) releaseParkedWork(db, input.projectId, input.id);
    return answered;
  });
  const row = externalReviewById(db, input.projectId, input.id);
  if (row === undefined) return { ok: false, reason: "not-found" };
  if (Number(changed.changes) === 1) return { ok: true, value: row };
  return { ok: false, reason: row.state === "superseded" ? "superseded" : "answered", value: row };
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
  const sql = `SELECT e.* FROM external_reviews e WHERE e.state='waiting' AND ${wantedBy("e")} AND ${liveWork("e")}
    AND ${liveProject("e", "project_id")}
    ${projectId === undefined ? "" : "AND e.project_id=?"} ORDER BY e.waiting_since, e.rowid`;
  return projectId === undefined ? db.prepare(sql).all() : db.prepare(sql).all(projectId);
}

export type SettledReview = Pick<
  ExternalReview,
  "id" | "projectId" | "revisionId" | "workId" | "stage" | "itemKey"
>;

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

export interface ReviewReleaseDeps {
  readonly db: DatabaseSync;
  readonly now: () => Date;
  readonly emit: (projectId: string, event: ProjectEvent) => void;
  readonly tick: (projectId: string) => void;
  readonly log: Pick<Log, "write">;
}

function itemName(db: DatabaseSync, review: SettledReview): string | undefined {
  const revision = revisionById(db, review.projectId, review.revisionId);
  return reviewItemName(review.itemKey, revision?.content.imageOrder ?? []);
}

// At boot and every few seconds: each review past its deadline passes, says so, and the run
// goes on. The deadline is a row, so a restart in between loses nothing. Each passed review is
// announced and woken on its own: one that throws is logged, and the others still go on (the
// passing itself is already saved).
export function releaseDueReviews(deps: ReviewReleaseDeps): number {
  const passed = settleExternalReviews(deps.db, deps.now());
  for (const review of passed) {
    try {
      deps.emit(review.projectId, {
        type: "review.auto-passed",
        projectId: review.projectId,
        reviewId: review.id,
        stage: review.stage,
        itemKey: review.itemKey,
        item: itemName(deps.db, review),
        revisionId: review.revisionId,
        workId: review.workId,
      });
      deps.emit(review.projectId, { type: "project.updated", projectId: review.projectId });
      deps.tick(review.projectId);
    } catch (error) {
      deps.log.write("error", "review.deadline", {
        projectId: review.projectId,
        detail: `Review ${review.id} passed at its deadline, but announcing it or waking the run failed: ${causedBy(error)}`,
      });
    }
  }
  return passed.length;
}
