import type { StageKind } from "@app/kernel/pipeline.js";

// One name per stage, everywhere a stage is named: the project's rail and run steps, the cost
// table, the checkpoints, Create's review, Edit settings, Home and Usage. The pipeline calls
// the narration stage `audio` and the PDF stage `document`; a person never sees those words.
// A Video stage that only exports the narration is named by `stageName` (project/summary.ts).
export const stageWords: Readonly<Record<StageKind, string>> = {
  research: "Research",
  article: "Article",
  audio: "Narration",
  images: "Images",
  thumbnail: "Thumbnail",
  video: "Video",
  document: "PDF",
};
