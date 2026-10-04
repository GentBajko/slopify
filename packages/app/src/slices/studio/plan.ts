import type { DatabaseSync } from "node:sqlite";
import { templateById } from "../project-templates/repo.js";
import { scheduleRows } from "../schedules/repo.js";
import { readSetting, writeSetting } from "../settings/repo.js";

// The posting plan: a week of long-video slots, each with its shorts. Each schedule sets its
// own (its release times, one line per day it runs, in its time zone); lines saved in Settings
// before that are kept in the plan's time zone. A finished project takes the next free slot when its
// upload is prepared; each of its shorts goes out at the first time its day and hour come round
// after its own long video, so a plan never needs "next week" notes. The extension types the
// times into Studio's schedule, in the browser's own time zone.

export {
  type PlanSlot,
  type PostingPlan,
  postingPlanSchema,
  weekdays,
} from "./plan-model.js";

import { type PlanSlot, type PostingPlan, postingPlanSchema, seriesOf } from "./plan-model.js";

export const postingPlanKey = "studio.postingPlan";
const key = postingPlanKey;

// No plan until one is made: nothing is scheduled, and Prepare upload says so.
export function emptyPlan(timeZone: string): PostingPlan {
  return { timeZone, rows: [] };
}

export function localTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

// The plan as stored in Settings: the lines made before schedules had release times.
export function readStoredPlan(db: DatabaseSync): PostingPlan {
  const stored = readSetting(db, key);
  if (stored !== undefined)
    try {
      const parsed = postingPlanSchema.safeParse(JSON.parse(stored));
      if (parsed.success)
        return {
          ...parsed.data,
          rows: parsed.data.rows.filter((row) => row.schedule === undefined),
        };
    } catch {
      // A broken setting reads as no plan.
    }
  return emptyPlan(localTimeZone());
}

// The series of a schedule's template, from its project title ("{{Topic}} | Stories" →
// "Stories"); "" when the template is gone or its title names none.
function templateSeries(db: DatabaseSync, templateId: string): string {
  try {
    const title = templateById(db, templateId)?.document.form.title;
    return title === undefined ? "" : seriesOf({ title });
  } catch {
    return "";
  }
}

// The lines every release is planned from: each schedule's release times (one line for each
// day it runs), then the stored lines.
export function readPlan(db: DatabaseSync): PostingPlan {
  const stored = readStoredPlan(db);
  const fromSchedules = scheduleRows(db)
    .filter((schedule) => schedule.deletedAt === null && schedule.status !== "canceled")
    .flatMap((schedule) =>
      schedule.releases.map((release) => ({
        name: `s${schedule.id.slice(0, 8)}${String(release.day)}`,
        series: templateSeries(db, schedule.templateId),
        long: release.long,
        shorts: [...release.shorts],
        schedule: schedule.id,
        runDay: release.day,
        timeZone: schedule.timezone,
        label: schedule.name,
      })),
    );
  return { ...stored, rows: [...fromSchedules, ...stored.rows] };
}

export function writePlan(db: DatabaseSync, plan: PostingPlan): void {
  const parsed = postingPlanSchema.parse(plan);
  writeSetting(
    db,
    key,
    JSON.stringify({ ...parsed, rows: parsed.rows.filter((row) => row.schedule === undefined) }),
  );
}

// ---- dates in the plan's time zone ------------------------------------------------------

interface LocalDate {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly weekday: number;
}

function partsIn(timeZone: string, at: Date): Record<string, number> {
  const format = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  });
  const out: Record<string, number> = {};
  for (const part of format.formatToParts(at))
    if (part.type !== "literal") out[part.type] = Number(part.value);
  return out;
}

// How far the zone is ahead of UTC at that instant, in milliseconds.
function offsetAt(timeZone: string, at: Date): number {
  const p = partsIn(timeZone, at);
  const local = Date.UTC(
    p.year ?? 0,
    (p.month ?? 1) - 1,
    p.day ?? 1,
    p.hour ?? 0,
    p.minute ?? 0,
    p.second ?? 0,
  );
  return local - Math.floor(at.getTime() / 1000) * 1000;
}

// The instant a wall-clock time names in the zone (the later reading when a clock change
// makes it ambiguous, the hour after when it skips it).
export function zonedInstant(timeZone: string, date: LocalDate, time: string): Date {
  const [hour, minute] = time.split(":").map(Number);
  const wall = Date.UTC(date.year, date.month - 1, date.day, hour ?? 0, minute ?? 0);
  const first = wall - offsetAt(timeZone, new Date(wall));
  return new Date(wall - offsetAt(timeZone, new Date(first)));
}

function localDate(timeZone: string, at: Date): LocalDate {
  const p = partsIn(timeZone, at);
  const year = p.year ?? 1970;
  const month = p.month ?? 1;
  const day = p.day ?? 1;
  return { year, month, day, weekday: new Date(Date.UTC(year, month - 1, day)).getUTCDay() };
}

function addDays(date: LocalDate, days: number): LocalDate {
  const next = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return {
    year: next.getUTCFullYear(),
    month: next.getUTCMonth() + 1,
    day: next.getUTCDate(),
    weekday: next.getUTCDay(),
  };
}

// The weekday (0 is Sunday) an instant falls on in the zone.
export function weekdayIn(timeZone: string, at: Date): number {
  return localDate(timeZone, at).weekday;
}

// The first time the slot's day and hour come round after `after`.
export function nextOccurrence(timeZone: string, slot: PlanSlot, after: Date): Date {
  let date = localDate(timeZone, after);
  for (let step = 0; step < 15; step += 1, date = addDays(date, 1)) {
    if (date.weekday !== slot.day) continue;
    const at = zonedInstant(timeZone, date, slot.time);
    if (at.getTime() > after.getTime()) return at;
  }
  return new Date(after.getTime() + 7 * 24 * 60 * 60 * 1000);
}

// Every time the slot's day and hour come round from `from` (inclusive) to `until`.
export function zonedTimes(
  timeZone: string,
  slot: PlanSlot,
  from: Date,
  until: Date,
): readonly Date[] {
  const times: Date[] = [];
  let date = localDate(timeZone, new Date(from.getTime() - 24 * 60 * 60 * 1000));
  for (; ; date = addDays(date, 1)) {
    if (date.weekday !== slot.day) continue;
    const at = zonedInstant(timeZone, date, slot.time);
    if (at.getTime() >= until.getTime()) return times;
    if (at.getTime() >= from.getTime()) times.push(at);
  }
}
