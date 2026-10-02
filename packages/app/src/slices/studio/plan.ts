import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { readSetting, writeSetting } from "../settings/repo.js";

// The posting plan (Settings → YouTube Studio → Posting plan): a week of long-video slots, each
// with its shorts, kept in one time zone. A finished project takes the next free slot when its
// upload is prepared; each of its shorts goes out at the first time its day and hour come round
// after its own long video, so a plan never needs "next week" notes. The extension types the
// times into Studio's schedule, in the browser's own time zone.

export const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

const slotSchema = z.object({
  day: z.number().int().min(0).max(6),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
});
const rowSchema = z.object({
  name: z.string().trim().min(1).max(20),
  long: slotSchema,
  shorts: z.array(slotSchema).max(10),
});
export const postingPlanSchema = z.object({
  timeZone: z.string().min(1).max(100),
  rows: z.array(rowSchema).max(14),
});
export type PostingPlan = z.infer<typeof postingPlanSchema>;
export type PlanSlot = z.infer<typeof slotSchema>;

const key = "studio.postingPlan";

// Three long videos a week, five shorts each, the channel's own times.
export function defaultPlan(timeZone: string): PostingPlan {
  const at = (day: number, time: string): PlanSlot => ({ day, time });
  return {
    timeZone,
    rows: [
      {
        name: "A",
        long: at(0, "20:00"),
        shorts: [at(1, "00:00"), at(1, "17:00"), at(2, "00:00"), at(2, "17:00"), at(3, "17:00")],
      },
      {
        name: "B",
        long: at(2, "20:00"),
        shorts: [at(3, "00:00"), at(4, "00:00"), at(4, "17:00"), at(5, "17:00"), at(6, "17:00")],
      },
      {
        name: "C",
        long: at(4, "20:00"),
        shorts: [at(5, "00:00"), at(6, "00:00"), at(6, "21:00"), at(0, "00:00"), at(0, "17:00")],
      },
    ],
  };
}

export function localTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

export function readPlan(db: DatabaseSync): PostingPlan {
  const stored = readSetting(db, key);
  if (stored !== undefined)
    try {
      const parsed = postingPlanSchema.safeParse(JSON.parse(stored));
      if (parsed.success) return parsed.data;
    } catch {
      // A broken setting reads as the default plan.
    }
  return defaultPlan(localTimeZone());
}

export function writePlan(db: DatabaseSync, plan: PostingPlan): void {
  writeSetting(db, key, JSON.stringify(postingPlanSchema.parse(plan)));
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

// ---- slots ------------------------------------------------------------------------------

export interface Slot {
  readonly row: string;
  // The long video's time, ISO.
  readonly longAt: string;
}

export interface Schedule extends Slot {
  // Each short's time, in order, ISO.
  readonly shortsAt: readonly string[];
}

// The coming long-video slots in time order, from `now` (a slot starting within the hour is
// too close to prepare), over `weeks` weeks.
export function comingSlots(plan: PostingPlan, now: Date, weeks = 8): readonly Slot[] {
  const soonest = now.getTime() + 60 * 60 * 1000;
  const start = localDate(plan.timeZone, now);
  const slots: { row: string; at: Date }[] = [];
  for (let day = 0; day < weeks * 7; day += 1) {
    const date = addDays(start, day);
    for (const row of plan.rows) {
      if (row.long.day !== date.weekday) continue;
      const at = zonedInstant(plan.timeZone, date, row.long.time);
      if (at.getTime() >= soonest) slots.push({ row: row.name, at });
    }
  }
  return slots
    .toSorted((left, right) => left.at.getTime() - right.at.getTime())
    .map((slot) => ({ row: slot.row, longAt: slot.at.toISOString() }));
}

export function scheduleOf(plan: PostingPlan, slot: Slot): Schedule {
  const row = plan.rows.find((one) => one.name === slot.row);
  const longAt = new Date(slot.longAt);
  return {
    ...slot,
    shortsAt: (row?.shorts ?? []).map((short) =>
      nextOccurrence(plan.timeZone, short, longAt).toISOString(),
    ),
  };
}

// The project's slot: the one it was given, else the next free one, kept from now on.
export function assignedSlot(
  db: DatabaseSync,
  plan: PostingPlan,
  projectId: string,
  now: Date,
): Slot | undefined {
  const row = db
    .prepare("SELECT row_name, long_at FROM upload_slots WHERE project_id=?")
    .get(projectId);
  if (row !== undefined) return { row: String(row.row_name), longAt: String(row.long_at) };
  const free = freeSlots(db, plan, now, 1)[0];
  if (free === undefined) return undefined;
  setSlot(db, projectId, free, now);
  return free;
}

export function freeSlots(
  db: DatabaseSync,
  plan: PostingPlan,
  now: Date,
  count: number,
): readonly Slot[] {
  const taken = new Set(
    db
      .prepare("SELECT long_at FROM upload_slots")
      .all()
      .map((row) => String(row.long_at)),
  );
  return comingSlots(plan, now)
    .filter((slot) => !taken.has(slot.longAt))
    .slice(0, count);
}

export function setSlot(db: DatabaseSync, projectId: string, slot: Slot, now: Date): void {
  db.prepare(
    `INSERT INTO upload_slots(project_id,row_name,long_at,assigned_at) VALUES (?,?,?,?)
     ON CONFLICT(project_id) DO UPDATE SET row_name=excluded.row_name, long_at=excluded.long_at,
       assigned_at=excluded.assigned_at`,
  ).run(projectId, slot.row, slot.longAt, now.toISOString());
}

export function clearSlot(db: DatabaseSync, projectId: string): void {
  db.prepare("DELETE FROM upload_slots WHERE project_id=?").run(projectId);
}
