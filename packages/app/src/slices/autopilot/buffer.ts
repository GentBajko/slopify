import { type Cadence, nextOccurrence } from "../schedules/calendar.js";
import type { BufferForecast, ScheduleForecast, TopicGenerationMode } from "./model.js";

const dayMs = 24 * 60 * 60_000;

// One run a schedule will make, as the calendar lists it (`schedules/agenda.ts`).
export interface ForecastRun {
  readonly at: string;
  readonly scheduleId: string;
  readonly paused: boolean;
  readonly topicSource: "queued" | "held" | "generated" | "template";
  // The project made ahead for it (Prepare), when there is one.
  readonly prepared: string | null;
}

export interface ForecastSchedule {
  readonly id: string;
  readonly name: string;
  readonly paused: boolean;
  readonly queued: number;
  readonly generation: TopicGenerationMode;
  readonly generationFailing: boolean;
  readonly cadence: Cadence;
  readonly timezone: string;
}

// How far ahead the content is: each run the schedules will make is a slot, filled by a run
// made ahead or else by the next finished video not uploaded yet, in time order. A paused
// schedule's runs fill nothing and run dry never: they wait for Resume.
export function bufferForecast(input: {
  readonly now: Date;
  // The end of the window `runs` covers.
  readonly until: Date;
  readonly runs: readonly ForecastRun[];
  readonly ready: number;
  readonly schedules: readonly ForecastSchedule[];
}): BufferForecast {
  const slots = input.runs
    .filter((run) => !run.paused)
    .toSorted((a, b) => a.at.localeCompare(b.at));
  const prepared = slots.filter((run) => run.prepared !== null).length;
  let spare = input.ready;
  let coveredUntil: string | null = null;
  let firstGap: string | null = null;
  for (const slot of slots) {
    if (slot.prepared === null) {
      if (spare === 0) {
        firstGap = slot.at;
        break;
      }
      spare -= 1;
    }
    coveredUntil = slot.at;
  }
  const daysTo = (at: Date) =>
    Math.max(0, Math.floor((at.valueOf() - input.now.valueOf()) / dayMs));
  const perSchedule = input.schedules.map((schedule) =>
    scheduleForecast(
      schedule,
      input.runs.filter((run) => run.scheduleId === schedule.id),
    ),
  );
  const dry = perSchedule
    .flatMap((one) => (one.runsDryAt === null ? [] : [one.runsDryAt]))
    .toSorted();
  return {
    readyCount: input.ready + prepared,
    daysAhead:
      slots.length === 0
        ? null
        : firstGap === null
          ? daysTo(input.until)
          : daysTo(new Date(firstGap)),
    coveredUntil,
    runsDryAt: dry[0] ?? null,
    coveredBeyondWindow: slots.length > 0 && firstGap === null,
    perSchedule,
  };
}

function scheduleForecast(
  schedule: ForecastSchedule,
  runs: readonly ForecastRun[],
): ScheduleForecast {
  const base = {
    scheduleId: schedule.id,
    name: schedule.name,
    paused: schedule.paused,
    queued: schedule.queued,
    generating: schedule.generation,
    generationFailing: schedule.generationFailing,
  };
  if (schedule.paused) return { ...base, runsDryAt: null };
  const sorted = runs.toSorted((a, b) => a.at.localeCompare(b.at));
  const firstUnqueued = sorted.find((run) => run.topicSource !== "queued")?.at ?? null;
  switch (schedule.generation) {
    // It completes when its queue empties: the occurrence after the last queued run is the
    // first with nothing to make. With no queue it runs its template as saved, every time.
    case "off": {
      if (schedule.queued === 0) return { ...base, runsDryAt: null };
      const queued = sorted.filter((run) => run.topicSource === "queued");
      const last = queued.at(-1);
      // The queue reaches past the window: it doesn't run dry within it.
      if (last === undefined || queued.length < schedule.queued)
        return { ...base, runsDryAt: null };
      const next = nextOccurrence(
        schedule.cadence,
        schedule.timezone,
        new Date(new Date(last.at).valueOf() + 1000),
      );
      return { ...base, runsDryAt: next === null ? null : next.toISOString() };
    }
    // New topics wait for approval, so a run past the approved queue has nothing yet.
    case "hold":
      return { ...base, runsDryAt: firstUnqueued };
    // It refills its queue by itself, unless finding topics keeps failing.
    case "queue":
      return { ...base, runsDryAt: schedule.generationFailing ? firstUnqueued : null };
  }
}
