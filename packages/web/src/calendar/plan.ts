import type { Calendar, CalendarRun } from "@app/slices/schedules/schema.js";

// The calendar's pure half: which days it shows, what sits on each, and what a drop means.
// Each scheduled run takes the first topic in its schedule's queue, so a topic's place in the
// queue is its day; moving a topic to another run's day is moving it to that run's place.

const dayMs = 24 * 60 * 60_000;

export function dayKey(date: Date): string {
  return `${String(date.getFullYear())}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

// Monday 00:00 local of the week `date` is in.
export function mondayOf(date: Date): Date {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  return start;
}

// `weeks` rows of Monday to Sunday, from this week's Monday.
export function weekDays(from: Date, weeks: number): readonly (readonly Date[])[] {
  const monday = mondayOf(from);
  return Array.from({ length: weeks }, (_, week) =>
    Array.from({ length: 7 }, (_, day) => {
      const date = new Date(monday);
      date.setDate(monday.getDate() + week * 7 + day);
      return date;
    }),
  );
}

export interface Day {
  readonly key: string;
  readonly date: Date;
  readonly runs: CalendarRun[];
  readonly projects: Calendar["projects"][number][];
}

// Groups by the viewer's own calendar day. A project still going sits on today; a finished
// one on the day it finished. A batch item waiting its turn is listed under the batch queue.
export function byDay(calendar: Calendar, now: Date = new Date()): ReadonlyMap<string, Day> {
  const days = new Map<string, Day>();
  const dayOf = (iso: string): Day => {
    const date = new Date(iso);
    const key = dayKey(date);
    let day = days.get(key);
    if (day === undefined) {
      const start = new Date(date);
      start.setHours(0, 0, 0, 0);
      day = { key, date: start, runs: [], projects: [] };
      days.set(key, day);
    }
    return day;
  };
  const queued = new Set(calendar.queued.map((item) => item.projectId));
  for (const project of calendar.projects)
    if (!queued.has(project.id))
      dayOf(project.finishedAt ?? now.toISOString()).projects.push(project);
  for (const run of calendar.runs) dayOf(run.at).runs.push(run);
  return days;
}

export function rangeOf(from: Date, weeks: number): { readonly from: string; readonly to: string } {
  const monday = mondayOf(from);
  return {
    from: monday.toISOString(),
    to: new Date(monday.valueOf() + weeks * 7 * dayMs + dayMs).toISOString(),
  };
}

// What dropping the topic of `dragged` on `target` does: nothing, a move within its schedule's
// queue, a transfer onto the target's schedule at the target's place, or a refusal in words.
export type Drop =
  | { readonly kind: "none" }
  | {
      readonly kind: "move";
      readonly scheduleId: string;
      readonly baseVersion: number;
      readonly from: number;
      readonly to: number;
    }
  | {
      readonly kind: "transfer";
      readonly scheduleId: string;
      readonly baseVersion: number;
      readonly index: number;
      readonly targetId: string;
      readonly position: number | undefined;
    }
  | { readonly kind: "refused"; readonly message: string };

export function planDrop(
  dragged: CalendarRun,
  target: CalendarRun | undefined,
  targetDay: string,
): Drop {
  if (dragged.index === null)
    return {
      kind: "refused",
      message: `This run has no queued topic to move: it will use ${dragged.topicSource === "held" ? "a topic waiting for your approval" : dragged.topicSource === "generated" ? "a topic Slopify suggests" : "the template as saved"}.`,
    };
  if (target === undefined)
    return {
      kind: "refused",
      message: `No run is planned on ${targetDay}. Drop the topic on a day that has one, or change the schedule's days under Schedules.`,
    };
  if (target.scheduleId === dragged.scheduleId) {
    if (target.index === null)
      return {
        kind: "refused",
        message: `The run on ${targetDay} is past the end of ${dragged.scheduleName}'s queue. Drop the topic on a run that has one.`,
      };
    if (target.index === dragged.index) return { kind: "none" };
    return {
      kind: "move",
      scheduleId: dragged.scheduleId,
      baseVersion: dragged.scheduleVersion,
      from: dragged.index,
      to: target.index,
    };
  }
  return {
    kind: "transfer",
    scheduleId: dragged.scheduleId,
    baseVersion: dragged.scheduleVersion,
    index: dragged.index,
    targetId: target.scheduleId,
    // At the target's place; the end of its queue when the target run has no topic yet.
    position: target.index ?? undefined,
  };
}

// The next or previous run of the same schedule, for moving a topic a place with the keyboard.
export function neighbour(
  runs: readonly CalendarRun[],
  run: CalendarRun,
  by: -1 | 1,
): CalendarRun | undefined {
  if (run.index === null) return undefined;
  const wanted = run.index + by;
  return runs.find((other) => other.scheduleId === run.scheduleId && other.index === wanted);
}

// The title the run's project will get, when the server could work it out; the topic
// otherwise, or what the run will use instead.
export function runTitle(run: CalendarRun): string {
  if (run.renderedTitle !== null && run.renderedTitle.trim() !== "") return run.renderedTitle;
  return (
    run.topic ??
    (run.topicSource === "held"
      ? "A topic waiting for your approval"
      : run.topicSource === "generated"
        ? "A topic Slopify will suggest"
        : "The template as saved")
  );
}
