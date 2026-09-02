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
  return "pending";
}
