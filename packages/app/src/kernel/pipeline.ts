// The pipeline's vocabulary. It sits in the kernel because the runner, the slices that
// implement a stage and the edge that reports one all name the same finite sets, and the
// runner may not import a slice to learn them.

// The frame a run is made in, and the aspect an image is asked for: one set, named once.
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

// Four project states, derived in order: running if any stage is running, else canceled,
// else failed, else done when video is done. A project whose stages are all pending matches
// none of them - the real window between creating it and the runner starting the first
// stage - so `pending` is the fallback. Nothing stores it.
export const projectStates = ["running", "canceled", "failed", "done", "pending"] as const;
export type ProjectState = (typeof projectStates)[number];
