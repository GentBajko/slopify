import type { ProjectState, StageKind, StageState } from "../pipeline.js";

// Research → article → {audio ∥ images ∥ thumbnail} → video.
export const deps = {
  research: [],
  article: ["research"],
  audio: ["article"],
  images: ["article"],
  thumbnail: ["article"],
  video: ["audio", "images", "thumbnail"],
} as const satisfies Readonly<Record<StageKind, readonly StageKind[]>>;

// `provided` and `skipped` release a dependency exactly as `done` does.
export function satisfied(state: StageState): boolean {
  return state === "done" || state === "provided" || state === "skipped";
}

export interface StageStanding {
  readonly kind: StageKind;
  readonly state: StageState;
}

// The four states, in their order. Derived on every read, never stored.
export function derive(stages: readonly StageStanding[]): ProjectState {
  if (stages.some((stage) => stage.state === "running")) {
    return "running";
  }
  if (stages.some((stage) => stage.state === "canceled")) {
    return "canceled";
  }
  if (stages.some((stage) => stage.state === "failed")) {
    return "failed";
  }
  if (stages.some((stage) => stage.kind === "video" && stage.state === "done")) {
    return "done";
  }
  // Extended rule, beyond the four above. `pending` covers the window between creating a
  // project and the runner claiming its first stage. A second case is reachable: a stage
  // that stores its output in the same instant as the cancel stays `done`, so nothing is
  // `canceled` and a stopped run would read as about to start. A stage in a terminal state
  // tells the two apart - at creation none is `done`.
  //
  // ceiling: a process killed between a stage finishing and its dependent being claimed
  // reads `canceled` too. Separating those needs the cancel stored on the project, and
  // nothing about the status is stored.
  if (stages.some((stage) => stage.state === "done")) {
    return "canceled";
  }
  return "pending";
}

// How far through itself a stage row is: chapters, chunks, images or a
// render percentage, counted by the slice that runs it.
export interface StageProgress extends StageStanding {
  readonly progressCurrent: number | null;
  readonly progressTotal: number | null;
}

// The thin meter under a running row on Projects, averaging stage progress. Every stage
// the run asks for counts once: a finished one whole, a running one by its own progress, a
// waiting, failed or canceled one not at all. `provided` and `skipped` are left out rather
// than counted as finished, which would put a run with a supplied article a third of the
// way along before the first call was made.
export function progressOf(stages: readonly StageProgress[]): number {
  const asked = stages.filter((stage) => stage.state !== "provided" && stage.state !== "skipped");
  // A run made entirely of supplied files has nothing outstanding; dividing by zero
  // would answer NaN.
  if (asked.length === 0) {
    return 1;
  }
  const share = asked.reduce((total, stage) => total + shareOf(stage), 0);
  return share / asked.length;
}

function shareOf(stage: StageProgress): number {
  if (satisfied(stage.state)) {
    return 1;
  }
  if (stage.state !== "running") {
    return 0;
  }
  const total = stage.progressTotal ?? 0;
  if (total <= 0) {
    // The stage has not said how many chapters or chunks there are yet. Guessing gives a
    // meter that moves backwards when the count arrives.
    return 0;
  }
  return Math.min(1, Math.max(0, (stage.progressCurrent ?? 0) / total));
}
