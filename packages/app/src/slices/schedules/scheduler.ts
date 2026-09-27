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
  scheduleRows,
  updateRun,
} from "./repo.js";
import type { ScheduleRun, ScheduleSummary } from "./schema.js";
import { renderedTitle, scheduledValues } from "./topic-list.js";
import { generateTopics, generationDue, releaseTopicLeases } from "./topics.js";

const missedGraceMs = 60_000;

export interface ScheduleRunner {
  readonly tick: (now?: Date) => Promise<void>;
  readonly recover: (now?: Date) => number;
  // Starts one generation now, ignoring the wait after a failure.
  readonly requestTopics: (scheduleId: string) => void;
  // Resolves once every topic generation started so far has finished. Tests and shutdown.
  readonly generated: () => Promise<void>;
  // Shutdown: abandons the LLM calls of topic generations still going.
  readonly stop: () => Promise<void>;
}

export function createScheduleRunner(deps: ScheduleDeps): ScheduleRunner {
  let ticking = false;
  // ceiling: one entry per schedule generating now.
  const generations = new Set<Promise<unknown>>();
  const stopping = new AbortController();
  const generated = async (): Promise<void> => {
    while (generations.size > 0) await Promise.allSettled([...generations]);
  };
  // Topic generation can take minutes, so a tick starts it and moves on: another schedule's
  // run is never late because of it. The lease inside `generateTopics` is what keeps it to
  // one at a time per schedule.
  const start = (scheduleId: string, force: boolean): void => {
    if (stopping.signal.aborted) return;
    const running = generateTopics(deps, scheduleId, { signal: stopping.signal, force })
      .then((result) => {
        if (!result.ok && result.reason === "failed")
          deps.log.write("warn", "schedule.topics", { detail: result.message });
      })
      .catch(() => {
        deps.log.write("error", "schedule.topics", {
          detail: "Topic generation could not record its result.",
        });
      })
      .finally(() => {
        generations.delete(running);
      });
    generations.add(running);
  };
  const startGenerations = (now: Date): void => {
    for (const schedule of scheduleRows(deps.db))
      if (generationDue(schedule, now)) start(schedule.id, false);
  };
  return {
    generated,
    requestTopics: (scheduleId) => start(scheduleId, true),
    stop: async () => {
      stopping.abort();
      await generated();
    },
    tick: async (now = deps.clock.now()): Promise<void> => {
      if (ticking) return;
      ticking = true;
      try {
        recoverRunningRuns(
          deps.db,
          now.toISOString(),
          "The previous schedule tick could not record this run's result.",
        );
        startGenerations(now);
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
    recover: (now = deps.clock.now()): number => {
      releaseTopicLeases(deps);
      return recoverRunningRuns(deps.db, now.toISOString());
    },
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
    // A schedule that finds its own topics never runs the template without one.
    const noTopic =
      current.topicGeneration.mode !== "off" && current.items.length === 0
        ? noTopicReason(current)
        : null;
    const skip = occurrence || overlapping || noTopic !== null;
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
          ? "Skipped because the previous run of this schedule was still going."
          : occurrence
            ? "Skipped because Slopify was not running at the scheduled time."
            : noTopic
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

function noTopicReason(schedule: ScheduleSummary): string {
  const { held, error } = schedule.topics;
  if (held > 0)
    return `Skipped because no topic was approved: ${String(held)} ${held === 1 ? "topic is" : "topics are"} waiting for you. Approve them under Schedules → ${schedule.name} → Topics waiting.`;
  if (error !== null) return `Skipped because the topic queue was empty. ${error}`;
  return "Skipped because the topic queue was empty and new topics were still being generated. The next run uses the first one.";
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
    const topic = claimed.schedule.items[0];
    const fresh = {
      ...document,
      form: runForm(document.form, claimed.schedule, topic),
      variants: [],
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
    recordRunDispatch(deps.db, run, deps.clock.now().toISOString(), topic);
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

// One project per run. The first queued topic fills the chosen keyword, the schedule's fixed
// values fill the rest over the template's own, and the template's title is filled from the
// same keywords, so "History: {{Topic}}" names the project after the topic. A topic saved
// before topics had a keyword brings its own title and values instead.
function runForm<
  F extends { readonly title: string; readonly values: Readonly<Record<string, string>> },
>(form: F, schedule: ScheduleSummary, topic: ScheduleSummary["items"][number] | undefined): F {
  return {
    ...form,
    title: renderedTitle(form, schedule, topic),
    values: scheduledValues(form, schedule, topic),
  };
}

class ScheduleDispatchError extends Error {
  readonly reason: string;
  constructor(reason: string) {
    super(reason);
    this.reason = reason;
  }
}
