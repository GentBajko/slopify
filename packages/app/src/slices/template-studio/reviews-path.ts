import type { PlayDraftDocument } from "../play-drafts/schema.js";
import { type ReviewStage, reviewStages } from "../reviews/model.js";

// The Reviews & checkpoints sample: where a run stops for whom, in pipeline order. A checkpoint
// waits for a person; an automatic review is answered by the reviewer model or by an agent.

export interface PathStep {
  readonly id: string;
  readonly name: string;
  readonly kind: "checkpoint" | "review";
  readonly by: "you" | "model" | "agent";
  readonly detail: string;
}

// Every stage named, so a new review stage has to be placed here too.
const reviewNames: Readonly<Record<ReviewStage, string>> = {
  article: "Script",
  promise: "The opening's promise",
  narration: "Narration",
  images: "Pictures",
  thumbnail: "Thumbnail",
  shorts: "Shorts",
};
const checkpointNames: Readonly<Record<string, string>> = {
  audio: "Before the narration",
  images: "Before the pictures",
  video: "Before the video",
};

// Checkpoints stop before a stage; reviews judge what a stage made. In run order.
const order = [
  "review:article",
  // Read against the title and thumbnail before the paid narration.
  "review:promise",
  "checkpoint:audio",
  "review:narration",
  "checkpoint:images",
  "review:images",
  "review:thumbnail",
  "checkpoint:video",
  "review:shorts",
];

export function reviewsPath(document: PlayDraftDocument): readonly PathStep[] {
  const { form } = document;
  const agent = form.reviews?.reviewer === "agent";
  const steps: PathStep[] = [];
  for (const stage of form.checkpoints ?? [])
    steps.push({
      id: `checkpoint:${stage}`,
      name: checkpointNames[stage] ?? stage,
      kind: "checkpoint",
      by: "you",
      detail: "The run waits here until you approve it.",
    });
  for (const stage of reviewStages) {
    const mode = form.reviews?.stages[stage]?.mode ?? "off";
    if (mode === "off") continue;
    steps.push({
      id: `review:${stage}`,
      name: reviewNames[stage],
      kind: "review",
      by: agent ? "agent" : "model",
      detail: `${agent ? "Your agent answers this" : "The reviewer model checks it"}; ${mode === "redo" ? "a failed item is made again" : "a failed item is flagged for you"}.`,
    });
  }
  const rank = (step: PathStep): number => {
    const at = order.indexOf(step.id);
    return at === -1 ? order.length : at;
  };
  return steps.toSorted((a, b) => rank(a) - rank(b));
}
