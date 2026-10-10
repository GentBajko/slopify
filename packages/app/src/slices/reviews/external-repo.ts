import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { transact } from "../../kernel/db/tx.js";
import { liveProject } from "../admission/repo.js";
import type { Actor } from "../agents/model.js";
import type { ExternalAnswerResult, ExternalReview, SettledReview } from "./external-model.js";
import { externalReviewByFingerprint, externalReviewById } from "./external-rows.js";
import { liveWork, reviewStanding, wantedBy } from "./external-waiting.js";
import { type ReviewVerdict, reviewStages } from "./model.js";

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

// Cancel stops a run's reviews waiting. Retried, its step asks again (`openExternalReview`) and
// each review waits its whole two hours from then, not from before the cancel.
export function stopWaitingReviews(db: DatabaseSync, projectId: string): void {
  db.prepare(
    "UPDATE external_reviews SET state='superseded' WHERE project_id=? AND state='waiting'",
  ).run(projectId);
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

// The first verdict saved wins: read and answered in one transaction, so two agents answering
// at once cannot both succeed. A review whose item was just replaced is superseded here rather
// than at the next settle, a project in the Trash takes no verdict until it is restored, and a
// canceled run's review takes none at all.
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
  return transact(db, (): ExternalAnswerResult => {
    const review = externalReviewById(db, input.projectId, input.id);
    if (review === undefined) return { ok: false, reason: "not-found" };
    const standing = reviewStanding(db, review);
    if (standing === "trashed") return { ok: false, reason: "trashed" };
    if (standing === "superseded" || standing === "outdated")
      db.prepare(
        "UPDATE external_reviews SET state='superseded' WHERE project_id=? AND id=? AND state='waiting'",
      ).run(input.projectId, input.id);
    if (standing !== "waiting") return { ok: false, reason: standing, value: review };
    db.prepare(
      "UPDATE external_reviews SET state='answered', verdict=?, answered_by=?, answered_at=? WHERE project_id=? AND id=?",
    ).run(JSON.stringify(input.verdict), input.by, input.at, input.projectId, input.id);
    releaseParkedWork(db, input.projectId, input.id);
    return {
      ok: true,
      value: {
        ...review,
        state: "answered",
        verdict: input.verdict,
        answeredBy: input.by,
        answeredAt: input.at,
      },
    };
  });
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
