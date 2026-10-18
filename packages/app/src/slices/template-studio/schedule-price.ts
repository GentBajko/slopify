import type { DraftReviewDeps, DraftView } from "../play-drafts/model.js";
import { resolvePlayReview } from "../play-drafts/review.js";
import type { PlayDraftDocument } from "../play-drafts/schema.js";
import type { ProjectTemplate } from "../project-templates/model.js";
import { scheduledDocument } from "../schedules/prepare.js";
import type { ScheduleSummary } from "../schedules/schema.js";
import type { RunPrice } from "./schedule-sample.js";

// One scheduled run priced the way Play's review prices it, on a draft that is never saved:
// the template's version with the schedule's first topic and values. Asked in the sample job,
// never in a request.
export async function priceScheduledRun(
  deps: DraftReviewDeps,
  template: ProjectTemplate,
  schedule: ScheduleSummary,
): Promise<RunPrice> {
  const document = scheduledDocument(
    { ...deps, template: () => template },
    schedule,
    schedule.items[0],
  );
  if (document === undefined) return "the template could not be read.";
  return priceDocument(deps, document);
}

export async function priceDocument(
  deps: DraftReviewDeps,
  document: PlayDraftDocument,
): Promise<RunPrice> {
  const at = deps.clock.now().toISOString();
  const view: DraftView = {
    draft: { id: deps.uuid(), version: 1, createdAt: at, updatedAt: at, document },
    attachments: [],
    review: null,
    pendingStart: null,
    start: null,
  };
  const review = await resolvePlayReview(deps, view, { unsaved: true });
  if (!review.ok)
    return review.fields.length === 0
      ? "Play's review refused this setup. Open the template in Play (Use in Play) to see why."
      : [...new Set(review.fields.map((field) => field.message))].join(" ");
  return {
    high: review.value.estimates.reduce((sum, estimate) => sum + estimate.high, 0),
    unknown: review.value.estimates.reduce((sum, estimate) => sum + estimate.unknown, 0),
  };
}
