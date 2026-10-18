import type { DatabaseSync } from "node:sqlite";
import { designOccurrences } from "./by-date.js";
import { designPlanOf } from "./next-run.js";
import type { CalendarRun, ScheduleSummary } from "./schema.js";

// The calendar's runs of a design schedule: one per row still to make, on the day it is made,
// named by the row's title. A row whose date is over isn't shown; the scheduler skips it.
export function upcomingDesignRuns(
  db: DatabaseSync,
  schedule: ScheduleSummary,
  now: Date,
  from: Date,
  to: Date,
): CalendarRun[] {
  if (schedule.cadence.kind !== "by-date") return [];
  const plan = designPlanOf(db, schedule.templateId);
  if (plan === undefined) return [];
  return designOccurrences(
    schedule.items,
    plan.dateField,
    plan.daysBefore,
    schedule.cadence.time,
    schedule.timezone,
    now,
  )
    .filter((one) => !one.over && one.at >= from && one.at < to)
    .map((one) => {
      const row = schedule.items[one.index];
      return {
        at: one.at.toISOString(),
        scheduleId: schedule.id,
        scheduleName: schedule.name,
        scheduleVersion: schedule.version,
        paused: schedule.status === "paused",
        templateId: schedule.templateId,
        templateVersion: plan.readyVersion ?? plan.headVersion,
        templateName: plan.name,
        index: one.index,
        topic: row?.title ?? null,
        topicSource: "queued" as const,
        renderedTitle: row?.title ?? null,
        prepared: null,
      };
    });
}
