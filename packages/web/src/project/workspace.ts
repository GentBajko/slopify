import type { StageKind } from "@app/kernel/pipeline.js";
import type { Stage } from "@app/slices/admission/model.js";
import { sectionsOf } from "./sections";

const finished = (stage: Stage): boolean => stage.state === "done" || stage.state === "provided";

// Counted in the page's five sections, not the run's seven stages, so "3 of 5" names cells
// the reader can see: research is part of Article and the thumbnail part of Images. A
// section is finished when every stage in it is, and a switched-off one is left out.
export function overallProgress(stages: readonly Stage[]): {
  readonly completed: number;
  readonly total: number;
  readonly percent: number;
} {
  const included = sectionsOf(stages)
    .map((section) =>
      [section.stage, section.companion].filter(
        (stage): stage is Stage => stage !== undefined && stage.state !== "skipped",
      ),
    )
    .filter((members) => members.length > 0);
  const total = included.length;
  const completed = included.filter((members) => members.every(finished)).length;
  const work = included.reduce(
    (sum, members) =>
      sum + members.reduce((part, stage) => part + stageWork(stage), 0) / members.length,
    0,
  );
  const percent =
    total === 0 ? 0 : Math.min(completed === total ? 100 : 99, Math.round((work / total) * 100));
  return { completed, total, percent };
}

function stageWork(stage: Stage): number {
  if (finished(stage)) return 1;
  if (stage.progressTotal === null || stage.progressTotal <= 0) return 0;
  return Math.min(0.99, Math.max(0, (stage.progressCurrent ?? 0) / stage.progressTotal));
}

export function suggestedStage(stages: readonly Stage[]): StageKind {
  const attention =
    stages.find((stage) => stage.state === "failed") ??
    stages.find((stage) => stage.state === "running");
  if (attention) return attention.kind;
  const video = stages.find((stage) => stage.kind === "video" && finished(stage));
  if (video) return video.kind;
  const pending = stages.find((stage) => stage.state === "pending");
  if (pending) return pending.kind;
  return (
    stages.find((stage) => stage.kind === "article" && finished(stage))?.kind ??
    stages.find((stage) => stage.state !== "skipped")?.kind ??
    "article"
  );
}
