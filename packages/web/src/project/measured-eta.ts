import type { Stage } from "@app/slices/admission/model.js";
import { type Eta, etaLabel, stageEta } from "@app/slices/eta/model.js";
import { overallProgress } from "./workspace.js";

// Time left on the project page, from what is measured. A step that names its own measure (the
// render's percent, `rebuild/activity.ts`) is timed by that measure as the page watched it move:
// the stage's own count of steps counts a quick caption step as much as the whole render, so it
// said "under a minute left" while the render crept from 0% to 18%. From the first percent the
// page saw to the latest, the rate it moves at gives the time left; until it has moved, the time
// is not known. Every other step keeps the stage's estimate (`slices/eta`).

// The first reading the page saw, and the last time the measure moved: the rate is taken
// between the two, so a percent that moves in whole steps counts down between them instead of
// growing while it waits for the next one.
interface Sample {
  readonly at: number;
  readonly percent: number;
  readonly movedAt: number;
  readonly movedTo: number;
}

// What the page has seen of each named measure, by stage and measure.
const seen = new Map<string, Sample>();

export function measuredEta(stage: Stage, now: number, memory = seen): Eta | undefined {
  const activity = stage.activity;
  if (stage.state !== "running" || activity === undefined) return stageEta(stage, now);
  // A named step's own measure: its percent, or how many of its things are done.
  const percent =
    activity.percent ??
    (activity.done !== undefined && activity.total !== undefined && activity.total > 0
      ? (activity.done / activity.total) * 100
      : undefined);
  // Named but not measured yet (the render before its first percent): the stage's count of
  // steps is no guide to it either.
  if (percent === undefined) return { basis: "unknown" };
  const key = `${stage.id}\0${stage.activity?.label ?? ""}`;
  const seenBefore = memory.get(key);
  // The first reading, or the measure started again (a second render, below where the last one
  // got to): the clock starts here.
  if (seenBefore === undefined || percent < seenBefore.movedTo) {
    memory.set(key, { at: now, percent, movedAt: now, movedTo: percent });
    return { basis: "unknown" };
  }
  const first =
    percent > seenBefore.movedTo ? { ...seenBefore, movedAt: now, movedTo: percent } : seenBefore;
  memory.set(key, first);
  if (percent >= 100) return { basis: "progress", seconds: 0 };
  const moved = first.movedTo - first.percent;
  const spent = (first.movedAt - first.at) / 1000;
  if (moved <= 0 || spent < 5) return { basis: "unknown" };
  const left = (spent / moved) * (100 - first.movedTo) - (now - first.movedAt) / 1000;
  return { basis: "progress", seconds: Math.max(1, Math.round(left)) };
}

// "Step 3 of 4": the section the run is at, counted as `overallProgress` counts (research inside
// Article, the thumbnail inside Images). The title row, the status list's Progress row, the
// Progress headline and its list of steps all count this way.
export function runStep(stages: readonly Stage[]): string | undefined {
  const { completed, total } = overallProgress(stages);
  return total === 0
    ? undefined
    : `Step ${String(Math.min(completed + 1, total))} of ${String(total)}`;
}

// "Step 2 of 4 · Narration · about 4 min left on this step": where the run stands, for the title
// row, with the step at work and its measured time left when there is one.
export function runPosition(
  stages: readonly Stage[],
  now: number,
  nameOf: (kind: Stage["kind"]) => string,
): string | undefined {
  const running = stages.find((stage) => stage.state === "running");
  if (running === undefined) return undefined;
  const eta = measuredEta(running, now);
  const label = eta === undefined || eta.basis === "unknown" ? undefined : etaLabel(eta);
  return [
    runStep(stages),
    nameOf(running.kind),
    label === undefined ? undefined : label.endsWith(" left") ? `${label} on this step` : label,
  ]
    .filter((part) => part !== undefined)
    .join(" · ");
}
