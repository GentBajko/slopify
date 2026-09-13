import { transact } from "../../kernel/db/tx.js";
import { reviewDraft } from "../play-drafts/review.js";
import { createDraft } from "../play-drafts/service.js";
import { startPlayDraft } from "../play-drafts/start.js";
import { freshTemplateDraft } from "../project-templates/setup.js";
import { nextOccurrence } from "./calendar.js";
import type { ClaimedScheduleRun, ScheduleDeps } from "./model.js";
import {
  activeRun,
  dueSchedules,
  insertRun,
  recordRunDispatch,
  recordRunStartIdentity,
  recoverRunningRuns,
  scheduleById,
  updateRun,
} from "./repo.js";
import type { ScheduleRun, ScheduleSummary } from "./schema.js";

const missedGraceMs = 60_000;

export interface ScheduleRunner {
  readonly tick: (now?: Date) => Promise<void>;
  readonly recover: (now?: Date) => number;
}

export function createScheduleRunner(deps: ScheduleDeps): ScheduleRunner {
  let ticking = false;
  return {
    tick: async (now = deps.clock.now()): Promise<void> => {
      if (ticking) return;
      ticking = true;
      try {
        recoverRunningRuns(
          deps.db,
          now.toISOString(),
          "The previous schedule tick could not record this run's result.",
        );
        const due = dueSchedules(deps.db, now.toISOString());
        const claimed = due.flatMap((schedule) => claim(deps, schedule, now));
        const settled = await Promise.allSettled(claimed.map((entry) => execute(deps, entry)));
        const failed = settled.find(
          (result): result is PromiseRejectedResult => result.status === "rejected",
        );
        if (failed) throw failed.reason;
      } finally {
        ticking = false;
      }
    },
    recover: (now = deps.clock.now()): number => recoverRunningRuns(deps.db, now.toISOString()),
  };
}

function claim(
  deps: ScheduleDeps,
  schedule: ScheduleSummary,
  now: Date,
): readonly [ClaimedScheduleRun] | readonly [] {
  if (schedule.nextRunAt === null) return [];
  const scheduledFor = new Date(schedule.nextRunAt);
  const occurrence =
    schedule.missedPolicy === "skip" && now.valueOf() - scheduledFor.valueOf() > missedGraceMs;
  let next = nextOccurrence(
    schedule.cadence,
    schedule.timezone,
    new Date(scheduledFor.valueOf() + 1000),
  );
  while (next !== null && next <= now)
    next = nextOccurrence(schedule.cadence, schedule.timezone, new Date(next.valueOf() + 1000));
  const status = next === null ? "completed" : schedule.status;
  return transact(deps.db, () => {
    const current = scheduleById(deps.db, schedule.id);
    if (
      current === undefined ||
      current.version !== schedule.version ||
      current.nextRunAt !== schedule.nextRunAt ||
      current.status !== "active"
    )
      return [];
    const overlapping = activeRun(deps.db, schedule.id, now.toISOString());
    const skip = occurrence || overlapping;
    const run: ScheduleRun = {
      id: deps.uuid(),
      scheduleId: schedule.id,
      scheduledFor: scheduledFor.toISOString(),
      status: skip ? "skipped" : "running",
      requestId: null,
      projectIds: [],
      estimate: null,
      startedAt: now.toISOString(),
      endedAt: skip ? now.toISOString() : null,
      error: skip
        ? overlapping
          ? "Skipped because another occurrence is still running."
          : "Skipped because the app missed this occurrence."
        : null,
    };
    if (!insertRun(deps.db, run)) return [];
    deps.db
      .prepare(
        "UPDATE schedules SET status=?,next_run_at=?,version=version+1,updated_at=? WHERE id=? AND version=?",
      )
      .run(status, next?.toISOString() ?? null, now.toISOString(), schedule.id, schedule.version);
    return skip ? [] : [{ run, schedule }];
  });
}

async function execute(deps: ScheduleDeps, claimed: ClaimedScheduleRun): Promise<void> {
  let run = claimed.run;
  try {
    const template = deps.template(claimed.schedule.templateId, claimed.schedule.templateVersion);
    if (template === undefined) throw new ScheduleDispatchError("missing-template");
    const document = freshTemplateDraft(deps, template.document, {
      id: claimed.schedule.templateId,
      version: claimed.schedule.templateVersion,
    });
    const fresh = {
      ...document,
      variants: claimed.schedule.items.map((item) => ({
        id: deps.uuid(),
        title: item.title,
        values: item.values,
      })),
    };
    const draft = createDraft(deps, { id: deps.uuid(), document: fresh });
    if (!draft.ok) throw new ScheduleDispatchError("conflict");
    const review = await reviewDraft(deps, { id: draft.value.draft.id, baseVersion: 1 });
    if (!review.ok) throw new ScheduleDispatchError(review.reason);
    const high = review.value.estimates.reduce((sum, estimate) => sum + estimate.high, 0);
    if (
      claimed.schedule.spendLimitCents !== null &&
      (review.value.estimates.some((estimate) => estimate.unknown > 0) ||
        high * 100 > claimed.schedule.spendLimitCents)
    )
      throw new ScheduleDispatchError("spend-limit");
    run = {
      ...run,
      requestId: review.value.id,
      estimate: review.value.estimates,
    };
    recordRunStartIdentity(deps.db, run);
    const started = await startPlayDraft(deps, {
      draftId: draft.value.draft.id,
      baseVersion: 1,
      reviewId: review.value.id,
    });
    if (!started.ok) throw new ScheduleDispatchError(started.reason);
    run = {
      ...run,
      requestId: started.value.requestId,
      projectIds: started.value.projectIds,
    };
    recordRunDispatch(deps.db, run, deps.clock.now().toISOString());
    run = {
      ...run,
      status: "succeeded",
      endedAt: deps.clock.now().toISOString(),
    };
  } catch (error) {
    run = {
      ...run,
      status: "failed",
      endedAt: deps.clock.now().toISOString(),
      error: error instanceof ScheduleDispatchError ? error.reason : "The scheduled run failed.",
    };
  }
  updateRun(deps.db, run);
}

class ScheduleDispatchError extends Error {
  readonly reason: string;
  constructor(reason: string) {
    super(reason);
    this.reason = reason;
  }
}
