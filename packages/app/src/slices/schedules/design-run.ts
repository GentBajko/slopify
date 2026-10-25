/// <reference lib="esnext.temporal" />

import { transact } from "../../kernel/db/tx.js";
import { missingValues } from "../designs/fields.js";
import { makeFromTemplate, quoteDocument } from "../designs/template-make.js";
import { designOccurrences } from "./by-date.js";
import { nextOccurrence } from "./calendar.js";
import type { ScheduleDeps } from "./model.js";
import { designPlanOf, missedGraceMs, nextRunOf } from "./next-run.js";
import { insertRun, scheduleById, updateRun } from "./repo.js";
import type { ScheduleRun, ScheduleSummary } from "./schema.js";

// One due run of a design schedule, all at once and in one transaction: it takes the row due
// soonest, makes its piece from the template's ready version and starts the artwork (the only
// paid step, made in the background by the design runner), removes the row and records the
// design on the run. Nothing here waits on a provider, so the tick moves on at once.
//
// A row whose date is over is removed with a skipped run that says so. A run that can't start
// (no ready version, a value missing, over the spend limit, no image provider) keeps its row,
// records why, and tries again at the same time the next day; marking a version ready tries
// again at once (`refreshDesignSchedules`). None of this reaches needs_attention: it shows on
// the schedule's runs.

export function claimDesignRun(deps: ScheduleDeps, schedule: ScheduleSummary, now: Date): void {
  const designs = deps.designs?.();
  transact(deps.db, () => {
    const current = scheduleById(deps.db, schedule.id);
    if (
      current === undefined ||
      current.version !== schedule.version ||
      current.nextRunAt !== schedule.nextRunAt ||
      current.status !== "active" ||
      current.cadence.kind !== "by-date"
    )
      return;
    const time = current.cadence.time;
    const plan = designPlanOf(deps.db, current.templateId);
    const due =
      plan === undefined
        ? undefined
        : designOccurrences(
            current.items,
            plan.dateField,
            plan.daysBefore,
            time,
            current.timezone,
            now,
          )[0];
    // Rows edited meanwhile: nothing is due yet, so only the next run moves.
    if (plan === undefined || due === undefined || due.at > now) {
      setNext(deps, current, nextRunOf(deps.db, current, now), current.items, now);
      return;
    }
    const row = current.items[due.index];
    if (row === undefined) return;
    const run = (status: ScheduleRun["status"], error: string | null): ScheduleRun => ({
      id: deps.uuid(),
      scheduleId: current.id,
      scheduledFor: schedule.nextRunAt ?? now.toISOString(),
      status,
      requestId: null,
      projectIds: [],
      designIds: [],
      estimate: null,
      startedAt: now.toISOString(),
      endedAt: status === "running" ? null : now.toISOString(),
      error,
    });
    const without = current.items.filter((_item, index) => index !== due.index);
    const date = row.values[plan.dateField] ?? "";
    if (due.over) {
      insertRun(deps.db, run("skipped", `Skipped: ${row.title} on ${date} is already over.`));
      setNext(deps, current, nextRunOf(deps.db, { ...current, items: without }, now), without, now);
      return;
    }
    const tomorrow = () => {
      const next = nextOccurrence({ kind: "daily", time }, current.timezone, now);
      const soonest = nextRunOf(deps.db, current, new Date(now.valueOf() + 1000));
      return next === null ? soonest : soonest === null || soonest < next ? next : soonest;
    };
    const keep = (status: "skipped" | "failed", error: string) => {
      insertRun(deps.db, run(status, error));
      setNext(deps, current, tomorrow(), current.items, now);
    };
    // A run Slopify wasn't open for, like a project schedule's: skipped when the schedule skips
    // missed runs. The row stays and is tried again at the same time the next day.
    const scheduledFor = schedule.nextRunAt === null ? now : new Date(schedule.nextRunAt);
    if (current.missedPolicy === "skip" && now.valueOf() - scheduledFor.valueOf() > missedGraceMs)
      return keep(
        "skipped",
        `Skipped: Slopify wasn't open at ${time} when ${row.title}'s poster was due, and this schedule skips the runs it misses. It tries again at ${time} tomorrow; to make a missed poster as soon as Slopify opens, set Missed run to Run once when Slopify reopens in Templates → Poster templates → ${plan.name} → Schedule.`,
      );
    if (designs === undefined)
      return keep(
        "failed",
        "Not started: designs aren't available in this copy of Slopify. Restart Slopify; if it keeps happening, reinstall it.",
      );
    if (plan.readyVersion === null)
      return keep(
        "skipped",
        `Not started: ${plan.name} has no version approved for schedules. Open it in Templates → Poster templates and press Approve for schedules.`,
      );
    const missing = missingValues(plan.document, row.values);
    if (missing.length > 0) {
      const list = missing.map((name) => `{{${name}}}`).join(", ");
      return keep(
        "failed",
        `Not started: ${row.title} has no ${list} in its row. Fill ${missing.length === 1 ? "it" : "them"} in under Schedules → ${current.name}; the next try is at ${time}.`,
      );
    }
    const quote = quoteDocument(designs.catalogue(), plan.document);
    if (
      current.spendLimitCents !== null &&
      (quote.unknown > 0 || quote.high * 100 > current.spendLimitCents)
    )
      return keep(
        "failed",
        `Not started: ${row.title}'s poster costs up to $${quote.high.toFixed(2)}${quote.unknown > 0 ? " and some prices are unknown" : ""}, over this schedule's spend limit. Raise the spend limit or choose an image model with a known, lower price.`,
      );
    const started = run("running", null);
    if (!insertRun(deps.db, started)) return;
    const made = makeFromTemplate(
      designs,
      current.templateId,
      {
        mutationId: `schedule-${started.id}`,
        values: row.values,
        acknowledgedHigh: quote.high,
        // A schedule with no spend limit makes pieces whose price is unknown, as it always has.
        acknowledgedUnknown: quote.unknown > 0,
        version: plan.readyVersion,
        name: row.title,
      },
      { scheduleId: current.id, scheduleRunId: started.id },
    );
    if (!made.ok) {
      updateRun(deps.db, {
        ...started,
        status: "failed",
        endedAt: now.toISOString(),
        error: `Not started: ${made.message}`,
      });
      setNext(deps, current, tomorrow(), current.items, now);
      return;
    }
    updateRun(deps.db, {
      ...started,
      status: "succeeded",
      designIds: [made.value.id],
      estimate: [quote],
      endedAt: now.toISOString(),
    });
    setNext(deps, current, nextRunOf(deps.db, { ...current, items: without }, now), without, now);
  });
}

// A design schedule stays active when its table empties: rows added later run as they come.
function setNext(
  deps: ScheduleDeps,
  schedule: ScheduleSummary,
  next: Date | null,
  items: ScheduleSummary["items"],
  now: Date,
): void {
  deps.db
    .prepare(
      "UPDATE schedules SET items_json=?, next_run_at=?, version=version+1, updated_at=? WHERE id=? AND version=?",
    )
    .run(
      JSON.stringify(items),
      next?.toISOString() ?? null,
      now.toISOString(),
      schedule.id,
      schedule.version,
    );
}
