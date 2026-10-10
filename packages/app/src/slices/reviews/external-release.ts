import type { DatabaseSync } from "node:sqlite";
import { causedBy } from "../../kernel/errors.js";
import type { ProjectEvent } from "../../kernel/events.js";
import type { Log } from "../../kernel/log.js";
import { reviewItemName } from "../notifications/rules.js";
import { revisionById } from "../revisions/repo.js";
import type { SettledReview } from "./external-model.js";
import { settleExternalReviews } from "./external-repo.js";

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
