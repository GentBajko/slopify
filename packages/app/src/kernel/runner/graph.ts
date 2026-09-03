import type { ProjectState, StageKind, StageState } from "../pipeline.js";

// logic/01 steps 2-5: research → article → {audio ∥ images ∥ thumbnail} → video.
export const deps = {
  research: [],
  article: ["research"],
  audio: ["article"],
  images: ["article"],
  thumbnail: ["article"],
  video: ["audio", "images", "thumbnail"],
} as const satisfies Readonly<Record<StageKind, readonly StageKind[]>>;

// logic/01 §Q2: a dependency is released by `provided` and `skipped` exactly as by `done`.
export function satisfied(state: StageState): boolean {
  return state === "done" || state === "provided" || state === "skipped";
}

export interface StageStanding {
  readonly kind: StageKind;
  readonly state: StageState;
}

// logic/01 §Q9, in its order. Derived on every read, never stored.
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
  // Extended rule, not one of §Q9's four. §Q9 offers no answer for a project that matches
  // none of them, and `pending` was chosen for the window between creating a project and
  // the runner claiming its first stage. `logic/13` §Q113 makes a second case reachable:
  // when the only running stage stores its output in the same instant as the cancel it
  // stays `done`, so nothing is `canceled` and a run the user stopped would read as one
  // about to start. `logic/13` step 3 is unconditional - "the project reads `canceled`" -
  // so that is what a run which started and stopped reads here.
  //
  // A stage in a terminal state is what tells the two apart: at creation every stage is
  // `pending`, `provided` or `skipped`, and only a stage the runner carried to the end is
  // `done`. Nothing restarts such a project by itself (§Q111), so `pending` is the one
  // answer that is certainly wrong.
  //
  // ceiling: a process killed between a stage finishing and its dependent being claimed
  // leaves the same rows and reads `canceled` too - `logic/01` §Q7 only reaches a stage
  // found `running`. Telling that apart needs the cancel recorded on the project, which is
  // the upgrade if it ever matters; §Q9 keeps status derived and stores nothing.
  if (stages.some((stage) => stage.state === "done")) {
    return "canceled";
  }
  return "pending";
}

// What a stage row carries about how far through itself it is (`logic/01` §Q6): chapters,
// chunks, images, or a render percentage, counted by the slice that runs it.
export interface StageProgress extends StageStanding {
  readonly progressCurrent: number | null;
  readonly progressTotal: number | null;
}

// The thin meter under a running row on 07 Projects, "averaging stage progress"
// (uiux/screens/07-projects.md). Every stage the run actually asks for counts once: a
// finished one whole, a running one by its own progress, a waiting, failed or canceled
// one not at all.
//
// `provided` and `skipped` are left out of the average rather than counted as finished.
// Nothing was asked of them, and counting them would put a run with research off and a
// supplied article at a third of the way along before the first call was made.
export function progressOf(stages: readonly StageProgress[]): number {
  const asked = stages.filter((stage) => stage.state !== "provided" && stage.state !== "skipped");
  // A run made entirely of supplied files has nothing outstanding, and a division by zero
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
    // A stage that has not yet said how many chapters or chunks there are. Guessing would
    // be a meter that moves backwards when the count arrives.
    return 0;
  }
  return Math.min(1, Math.max(0, (stage.progressCurrent ?? 0) / total));
}
