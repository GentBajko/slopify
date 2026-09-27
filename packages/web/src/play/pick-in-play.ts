import type { Entry, Prompt } from "@app/slices/library/model.js";
import type { PlayDraftDocument } from "@app/slices/play-drafts/model.js";
import { emptyReviews } from "./reviews";
import type { PlaySection } from "./sections";
import { freshShorts } from "./shorts";

export interface UsedInPlay {
  readonly document: PlayDraftDocument;
  // Where Play opens, and the field it focuses, so the pick is in view.
  readonly section: PlaySection;
  readonly field: string;
}

// Library → Use in Play: the current draft with this prompt or intro/outro picked, and the
// stage that uses it switched to the source that reads it. Everything else in the draft stays
// as it was, so a half-filled draft is not lost.
export function pickInPlay(document: PlayDraftDocument, item: Prompt | Entry): UsedInPlay {
  const form = document.form;
  const next = (changes: Partial<PlayDraftDocument["form"]>, section: PlaySection, field: string) =>
    ({ document: { ...document, form: { ...form, ...changes } }, section, field }) as const;
  if ("category" in item)
    return item.category === "intro"
      ? next({ intro: item.name }, "outputs", "intro")
      : next({ outro: item.name }, "outputs", "outro");
  switch (item.kind) {
    case "article":
      return next(
        { articlePrompt: item.name, sources: { ...form.sources, article: "generate" } },
        "content",
        "articlePrompt",
      );
    case "narration":
      return next({ narrationPrompt: item.name }, "outputs", "narrationPrompt");
    case "image": {
      const picked = form.imagePrompts.some((one) => one.name === item.name)
        ? form.imagePrompts
        : [...form.imagePrompts, { name: item.name, number: "1" }];
      return next(
        { imagePrompts: picked, sources: { ...form.sources, images: "generate" } },
        "outputs",
        `imagePrompts.${item.name}.number`,
      );
    }
    case "thumbnail":
      return next(
        { thumbnailPrompt: item.name, sources: { ...form.sources, thumbnail: "from_prompt" } },
        "outputs",
        "thumbnailPrompt",
      );
    case "description":
      return next(
        { descriptionPrompt: item.name, youtubeDescription: true },
        "outputs",
        "descriptionPrompt",
      );
    case "shorts":
      return next(
        { shorts: { ...(form.shorts ?? freshShorts), enabled: true, prompt: item.name } },
        "outputs",
        "shorts.prompt",
      );
    // A Review prompt goes to every review that is on; with none on, it turns the article's on.
    case "review": {
      const reviews = form.reviews ?? emptyReviews;
      const on = Object.entries(reviews.stages).filter(([, stage]) => stage.mode !== "off");
      const stages =
        on.length === 0
          ? { ...reviews.stages, article: { mode: "flag" as const, prompt: item.name } }
          : {
              ...reviews.stages,
              ...Object.fromEntries(
                on.map(([name, stage]) => [name, { ...stage, prompt: item.name }]),
              ),
            };
      return next({ reviews: { ...reviews, stages } }, "review", "reviews");
    }
  }
}
