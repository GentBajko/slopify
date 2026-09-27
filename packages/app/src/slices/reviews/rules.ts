import type { RunDraft } from "../admission/model.js";
import type { FieldError } from "../admission/rules.js";
import {
  imageReviewers,
  type ReviewStage,
  reviewModeOf,
  reviewRetriesMax,
  reviewRetriesMin,
  reviewStageLabels,
  reviewStages,
  visionStages,
} from "./model.js";

type ReviewDraft = Pick<RunDraft, "sources"> & {
  readonly reviews?: RunDraft["reviews"];
  readonly shorts?: { readonly enabled: boolean } | undefined;
};

// A stage is reviewed only while it makes something: a provided article, uploaded images or
// narration Off leave nothing for a reviewer to look at, so a review left on there asks for
// nothing and holds nothing up.
export function stageMakesItems(draft: ReviewDraft, stage: ReviewStage): boolean {
  const { sources } = draft;
  switch (stage) {
    case "article":
      return sources.article === "generate";
    case "images":
      return sources.images === "generate";
    case "narration":
      return sources.audio === "generate";
    case "thumbnail":
      return sources.thumbnail === "from_prompt" || sources.thumbnail === "prompt_by_llm";
    case "shorts":
      // `usesShorts` in admission/rules.ts, which imports this file.
      return draft.shorts?.enabled === true && sources.audio !== "off";
  }
}

export function activeReviewStages(draft: ReviewDraft): readonly ReviewStage[] {
  return reviewStages.filter(
    (stage) => reviewModeOf(draft.reviews, stage) !== "off" && stageMakesItems(draft, stage),
  );
}

// The narration review hears the narration back through the word timing, so the timing runs
// for it even with captions off.
export function reviewsNarration(draft: ReviewDraft): boolean {
  return activeReviewStages(draft).includes("narration");
}

export function usesReviews(draft: ReviewDraft): boolean {
  return activeReviewStages(draft).length > 0;
}

// Whether the chosen reviewer can be shown the pictures the image stages need it to judge.
export function reviewerSeesImages(provider: string): boolean {
  return imageReviewers.includes(provider);
}

export function reviewFields(draft: ReviewDraft): readonly FieldError[] {
  const active = activeReviewStages(draft);
  const reviews = draft.reviews;
  if (active.length === 0 || reviews === undefined) return [];
  const fields: FieldError[] = [];
  if (reviews.provider.trim() === "" || reviews.model.trim() === "")
    fields.push({
      field: "reviews.provider",
      message:
        "Automatic reviews need a reviewer model. Choose one in the Reviews section, or set every review to Off.",
    });
  const retries = reviews.retries;
  if (
    retries !== undefined &&
    (!Number.isInteger(retries) || retries < reviewRetriesMin || retries > reviewRetriesMax)
  )
    fields.push({
      field: "reviews.retries",
      message: `Enter a number of redos between ${reviewRetriesMin} and ${reviewRetriesMax} in the Reviews section.`,
    });
  const pictures = active.filter((stage) => visionStages.includes(stage));
  if (
    pictures.length > 0 &&
    reviews.provider.trim() !== "" &&
    !reviewerSeesImages(reviews.provider)
  )
    fields.push({
      field: "reviews.provider",
      message: `The ${pictures.map((stage) => reviewStageLabels[stage]).join(", ")} ${pictures.length === 1 ? "review looks" : "reviews look"} at pictures, and Slopify can't show pictures to this reviewer. In the Reviews section, choose Claude Code or Codex as the reviewer, or set ${pictures.length === 1 ? "that review" : "those reviews"} to Off.`,
    });
  return fields;
}
