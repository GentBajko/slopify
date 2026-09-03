// The pipeline's vocabulary. It sits in the kernel because the runner, the slices that
// implement a stage, and the edge that reports one all name the same finite sets, and
// the runner may not import a slice to learn them (03-conventions Dependency injection).

// The frame a run is made in, and the aspect an image is asked for: one set, named once
// (`logic/04`, `logic/09` step 1).
export const formats = ["16:9", "9:16"] as const;
export type Format = (typeof formats)[number];

export const stageKinds = ["research", "article", "audio", "images", "thumbnail", "video"] as const;
export type StageKind = (typeof stageKinds)[number];

export const stageStates = [
  "pending",
  "running",
  "done",
  "failed",
  "canceled",
  "provided",
  "skipped",
] as const;
export type StageState = (typeof stageStates)[number];

// logic/01 §Q9 names four project states and derives them in order: running if any
// stage is running, else canceled, else failed, else done when video is done. A project
// whose stages are all still pending matches none of them, and that window is real
// between creating the project and the runner starting the first stage, so `pending` is
// the fallback the derivation returns. Nothing stores it: status is always derived.
export const projectStates = ["running", "canceled", "failed", "done", "pending"] as const;
export type ProjectState = (typeof projectStates)[number];
