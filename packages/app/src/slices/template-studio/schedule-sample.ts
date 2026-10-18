import type { PlayDraftDocument } from "../play-drafts/schema.js";
import { nextOccurrence } from "../schedules/calendar.js";
import type { ScheduleSummary } from "../schedules/schema.js";
import { renderedTitle } from "../schedules/topic-list.js";

// The Schedule sample: the next runs of every schedule that runs the template, with the titles
// their queued topics fill, and what they cost a month at the high estimate.

export interface UpcomingRun {
  readonly at: string;
  readonly scheduleId: string;
  readonly scheduleName: string;
  readonly title: string;
  // False when the queue has run out by then: the run waits for a topic, or writes one.
  readonly topic: boolean;
}

export function upcomingRuns(
  schedules: readonly ScheduleSummary[],
  document: PlayDraftDocument,
  now: Date,
  count = 5,
): readonly UpcomingRun[] {
  const runs: UpcomingRun[] = [];
  for (const schedule of schedules) {
    if (schedule.status !== "active") continue;
    let after = now;
    for (let index = 0; index < count; index++) {
      const at = nextOccurrence(schedule.cadence, schedule.timezone, after);
      if (at === null) break;
      const topic = schedule.items[index];
      runs.push({
        at: at.toISOString(),
        scheduleId: schedule.id,
        scheduleName: schedule.name,
        title:
          topic === undefined && schedule.topicKeyword !== null
            ? document.form.title
            : renderedTitle(document.form, schedule, topic).trim() || document.form.title,
        topic: topic !== undefined,
      });
      after = new Date(at.getTime() + 1);
    }
  }
  return runs.toSorted((a, b) => a.at.localeCompare(b.at)).slice(0, count);
}

// How many runs a schedule makes in an average month.
export function runsPerMonth(schedule: ScheduleSummary, now: Date): number {
  if (schedule.status !== "active") return 0;
  const { cadence } = schedule;
  if (cadence.kind === "daily") return 365.25 / 12;
  if (cadence.kind === "weekly") return (cadence.days.length * 365.25) / 12 / 7;
  const at = nextOccurrence(cadence, schedule.timezone, now);
  return at !== null && at.getTime() - now.getTime() <= 30 * 24 * 60 * 60 * 1000 ? 1 : 0;
}

// One run's cost as Play's review prices it: the high estimate and the steps without a price.
// A string when the run couldn't be priced: why, in a sentence.
export type RunPrice = { readonly high: number; readonly unknown: number } | string;

export interface MonthlyCost {
  readonly runs: number;
  readonly high: number;
  readonly unknown: number;
  // Why a schedule's run couldn't be priced, when one couldn't.
  readonly problem: string | null;
}

export function monthlyCost(
  schedules: readonly ScheduleSummary[],
  prices: ReadonlyMap<string, RunPrice>,
  now: Date,
): MonthlyCost | null {
  const active = schedules.filter((schedule) => schedule.status === "active");
  if (active.length === 0) return null;
  let runs = 0;
  let high = 0;
  let unknown = 0;
  let problem: string | null = null;
  for (const schedule of active) {
    const perMonth = runsPerMonth(schedule, now);
    runs += perMonth;
    const price = prices.get(schedule.id);
    if (price === undefined || typeof price === "string") {
      unknown += 1;
      problem ??=
        price === undefined
          ? `The cost of the runs of ${schedule.name} isn't worked out yet: it is, with the free samples.`
          : `The runs of ${schedule.name} couldn't be priced: ${price} Fix it in this studio, press Save, then Make samples.`;
      continue;
    }
    high += price.high * perMonth;
    unknown += price.unknown;
  }
  return { runs: Math.round(runs * 10) / 10, high: Math.round(high * 100) / 100, unknown, problem };
}
