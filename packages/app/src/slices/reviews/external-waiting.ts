import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { liveProject, oneProject, projectTrashed } from "../admission/repo.js";
import type { ExternalReview, ReviewStanding } from "./external-model.js";
import { externalReviewOf } from "./external-rows.js";

// A review the project still wants: its step is reserved by the project's current version with
// the same fingerprint. A rerun or an edit that replaced the item leaves it unwanted.
export function wantedBy(table: string): string {
  return `EXISTS (SELECT 1 FROM revision_work_reservations r
    JOIN project_heads h ON h.project_id=r.project_id AND h.revision_id=r.revision_id
    WHERE r.project_id=${table}.project_id AND r.work_id=${table}.work_id
      AND r.work_key=${table}.work_key AND r.fingerprint=${table}.review_fingerprint)`;
}

// Nothing of a canceled run goes ahead on its own: the review's work, or its own step, is
// canceled. Another step canceled is not enough: retrying one step (`recoverProject`) admits
// it again while the rest stay canceled, and its reviews wait for their verdict.
export function liveWork(table: string): string {
  return `EXISTS (SELECT 1 FROM revision_work w WHERE w.id=${table}.work_id AND NOT ${canceledStep("w")})`;
}

// The step reads canceled by its stage too, whatever the work row says: a restart before
// canceled work was kept canceled (`recoverWork`) held it pending.
function canceledStep(work: string): string {
  return `(${work}.state='canceled' OR EXISTS (SELECT 1 FROM stages s WHERE s.id=${work}.stage_id AND s.state='canceled'))`;
}

// Where a review stands, in the one order get_external_review and a refused verdict both say
// it: a verdict already kept, its step canceled (no new one waits), its item replaced or its
// step gone (`superseded` or `outdated`), then its project in the Trash - said last, as only
// then would Restore bring it back. It waits only when none holds, exactly when `stillWaiting`
// lists it.
export function reviewStanding(db: DatabaseSync, review: ExternalReview): ReviewStanding {
  if (review.state === "answered" || review.state === "auto-passed") return review.state;
  if (
    db
      .prepare(`SELECT 1 FROM revision_work w WHERE w.id=? AND ${canceledStep("w")}`)
      .get(review.workId) !== undefined
  )
    return "canceled";
  const wanted =
    review.state === "waiting" &&
    db
      .prepare(
        `SELECT 1 FROM external_reviews e WHERE e.project_id=? AND e.id=? AND ${wantedBy("e")} AND ${liveWork("e")}`,
      )
      .get(review.projectId, review.id) !== undefined;
  if (!wanted) return replacementWaits(db, review) ? "superseded" : "outdated";
  return projectTrashed(db, review.projectId) ? "trashed" : "waiting";
}

// Whether another review of the same item waits in its place.
function replacementWaits(db: DatabaseSync, review: ExternalReview): boolean {
  return (
    db
      .prepare(
        `SELECT 1 FROM external_reviews e WHERE ${stillWaiting} AND e.project_id=? AND e.item_key=? AND e.id!=?`,
      )
      .get(review.projectId, review.itemKey, review.id) !== undefined
  );
}

// A review `e` that waits: still wanted, of a run that isn't canceled and a project not in the
// Trash.
const stillWaiting = `e.state='waiting' AND ${wantedBy("e")} AND ${liveWork("e")} AND ${liveProject("e", "project_id")}`;

// Waiting, still wanted by the current version, of a run that isn't canceled, oldest first.
export function waitingExternalReviews(
  db: DatabaseSync,
  projectId?: string,
): readonly ExternalReview[] {
  return waitingExternalReviewRows(db, projectId).map(externalReviewOf);
}

// The same rows unread, for a caller that skips one it can't read instead of failing them all.
export function waitingExternalReviewRows(db: DatabaseSync, projectId?: string): unknown[] {
  const one = oneProject("e", projectId);
  return db
    .prepare(
      `SELECT e.* FROM external_reviews e WHERE ${stillWaiting}${one.sql} ORDER BY e.waiting_since, e.rowid`,
    )
    .all(...one.params);
}

// The projects with a review waiting for an agent, as `waitingExternalReviewRows` finds them.
export function projectsWaitingOnAgents(db: DatabaseSync, projectId?: string): ReadonlySet<string> {
  const one = oneProject("e", projectId);
  const rows = db
    .prepare(`SELECT DISTINCT e.project_id FROM external_reviews e WHERE ${stillWaiting}${one.sql}`)
    .all(...one.params);
  return new Set(rows.map((row) => z.string().parse(row.project_id)));
}
