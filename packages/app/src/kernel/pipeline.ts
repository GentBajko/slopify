// The pipeline's vocabulary. It sits in the kernel because the runner, the slices that
// implement a stage and the edge that reports one all name the same finite sets, and the
// runner may not import a slice to learn them.

// The frame a run is made in, and the aspect an image is asked for: one set, named once.
export const formats = ["16:9", "9:16", "1:1"] as const;
export type Format = (typeof formats)[number];

// The shape a project's thumbnail is drawn in: YouTube shows thumbnails 16:9, so a square
// project's is landscape; the others follow the project.
export function thumbnailAspect(format: Format): "16:9" | "9:16" {
  return format === "1:1" ? "16:9" : format;
}

// Document is last so every screen that walks this list in order shows the six older
// stages where they always were.
export const stageKinds = [
  "research",
  "article",
  "audio",
  "images",
  "thumbnail",
  "video",
  "document",
] as const;
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

// A persisted pause overrides the stage-derived status. A completed run need not
// include a video: all selected stages being satisfied is enough. `partial` is a run whose
// main output was made while another step failed (the video is there, its thumbnail is
// not): done with problems, not failed.
export const projectStates = [
  "running",
  "paused",
  "canceled",
  "failed",
  "partial",
  "done",
  "pending",
] as const;
export type ProjectState = (typeof projectStates)[number];
