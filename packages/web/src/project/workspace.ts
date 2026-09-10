import type { StageKind } from "@app/kernel/pipeline.js";
import type { Stage } from "@app/slices/admission/model.js";

const finished = (stage: Stage): boolean => stage.state === "done" || stage.state === "provided";

export function overallProgress(stages: readonly Stage[]): {
  readonly completed: number;
  readonly total: number;
  readonly percent: number;
} {
  const included = stages.filter((stage) => stage.state !== "skipped");
  const total = included.length;
  const completed = included.filter(finished).length;
  const work = included.reduce((sum, stage) => {
    if (finished(stage)) return sum + 1;
    if (stage.progressTotal === null || stage.progressTotal <= 0) return sum;
    return sum + Math.min(0.99, Math.max(0, (stage.progressCurrent ?? 0) / stage.progressTotal));
  }, 0);
  const percent =
    total === 0 ? 0 : Math.min(completed === total ? 100 : 99, Math.round((work / total) * 100));
  return { completed, total, percent };
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
