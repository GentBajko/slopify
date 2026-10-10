import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { transact } from "../../kernel/db/tx.js";
import { causedBy } from "../../kernel/errors.js";
import type { ProjectEvent } from "../../kernel/events.js";
import type { Log } from "../../kernel/log.js";
import { liveProject } from "../admission/repo.js";
import { reviewItemName } from "../notifications/rules.js";
import { revisionById } from "../revisions/repo.js";
import type { SettledReview } from "./external-model.js";
import { liveWork, releaseParkedWork, wantedBy } from "./external-repo.js";
import { reviewStages } from "./model.js";

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
