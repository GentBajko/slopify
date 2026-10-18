import type { DatabaseSync } from "node:sqlite";
import type { DraftReviewDeps } from "../play-drafts/model.js";
import { templateById } from "../project-templates/repo.js";
import type { FreeSamples } from "./free.js";
import type { SampleJob } from "./jobs.js";
import { priceScheduledRun } from "./schedule-price.js";
import { type PriceCache, priceKey, templateSchedules } from "./service.js";

export interface SampleMakerDeps {
  readonly db: DatabaseSync;
  readonly free: FreeSamples;
  readonly prices: PriceCache;
  // Play's review, which prices a schedule's run.
  readonly review: DraftReviewDeps;
  readonly changed: (templateId: string) => void;
  // The paid sample of a Save, a topic or the full script; without it only the free ones are
  // made.
  readonly paid?: ((job: SampleJob, signal: AbortSignal) => Promise<void>) | undefined;
}

// What one sample job makes: the free samples of its version, its paid sample unless it asked
// for the free ones only, then the price of each schedule's run, the studio told after each so its page fills in as they land. A template deleted since
// the job was queued makes nothing.
export function sampleMaker(
  deps: SampleMakerDeps,
): (job: SampleJob, signal: AbortSignal) => Promise<void> {
  return async (job, signal) => {
    const template = templateById(deps.db, job.templateId, job.templateVersion);
    if (template === undefined) return;
    await deps.free.make(template.document, signal);
    deps.changed(template.id);
    if (job.kind !== "free" && deps.paid !== undefined && !signal.aborted) {
      await deps.paid(job, signal);
      deps.changed(template.id);
    }
    const head = templateById(deps.db, job.templateId);
    if (head === undefined) return;
    for (const schedule of templateSchedules(deps.db, head.id)) {
      if (signal.aborted) return;
      const key = priceKey(schedule, head);
      if (deps.prices.get(key) !== undefined) continue;
      deps.prices.set(key, await priceScheduledRun(deps.review, head, schedule));
      deps.changed(head.id);
    }
  };
}
