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
