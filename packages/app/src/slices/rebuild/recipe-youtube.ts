import { usesYoutubeDescription } from "../admission/rules.js";
import {
  type RecipeContext,
  type ResolvedWorkRecipe,
  recipe,
  resourceIdentity,
} from "./recipe-model.js";
import { renderedPrompt } from "./recipe-text.js";

// The YouTube description is written from the word timing, so it waits for
// `subtitles:timing` and nothing else: it runs beside the render, and a change to the
// motion, zoom, images or captions' look leaves it current. The transcript is only known once
// the timing lands, so the request is built when the step runs (`runtime-youtube.ts`); what
// identifies it here is the timing it reads, the prompt, the model and the title.
export function youtubeRecipes(
  context: RecipeContext,
  exports: readonly ResolvedWorkRecipe[],
): readonly ResolvedWorkRecipe[] {
  const { config } = context;
  const timing = exports.find((value) => value.key === "subtitles:timing");
  if (!usesYoutubeDescription(config) || timing === undefined) return [];
  return [
    recipe(
      context,
      "youtube:description",
      "video",
      {
        kind: "local",
        version: 1,
        operation: "youtube-description-v1",
        values: [
          resourceIdentity(context, timing),
          config.llm?.provider ?? "",
          config.llm?.model ?? "",
          config.llm?.thinking ?? null,
          // Blank means the built-in prompt; the step fills it in, so a new built-in wording
          // ships as a new operation version rather than a silent change here.
          config.descriptionPrompt?.trim() ? renderedPrompt(context, "description") : "",
          config.title,
        ],
      },
      [timing.key],
      // A paid LLM call: readiness, the charge warning and the estimate treat it like one.
      { kind: "provider" },
    ),
  ];
}
