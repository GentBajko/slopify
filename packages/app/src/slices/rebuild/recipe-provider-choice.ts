import type { ProviderFamily } from "../../kernel/ports/model.js";
import type { RunConfig } from "../admission/model.js";
import type { ResolvedWorkRecipe } from "./recipe-model.js";

export interface RecipeProviderChoice {
  readonly provider: string;
  readonly model: string;
  readonly family: ProviderFamily;
  readonly voice?: string | undefined;
  readonly thinking?: import("../../kernel/ports/llm.js").ThinkingMode | null | undefined;
}

export function recipeProviderChoice(
  recipe: Pick<ResolvedWorkRecipe, "stage" | "input">,
  config: RunConfig,
): RecipeProviderChoice | undefined {
  const input = recipe.input;
  if (input.kind === "llm" || input.kind === "tts" || input.kind === "image")
    return { ...input, family: input.kind };
  // The YouTube description's request is built when it runs, from the project's LLM row.
  if (input.kind === "local" && input.operation === "youtube-description-v1")
    return config.llm === undefined ? undefined : { ...config.llm, family: "llm" };
  // A review's request is built when it runs, from the reviewer the project chose.
  if (input.kind === "local" && input.operation === "review-v1")
    return config.reviews === undefined
      ? undefined
      : {
          provider: config.reviews.provider,
          model: config.reviews.model,
          ...(config.reviews.thinking === undefined ? {} : { thinking: config.reviews.thinking }),
          family: "llm",
        };
  // So is the shorts' pick; what stands in for the rest of the step until it lands is
  // mostly images, which are its cost.
  if (input.kind === "local" && input.operation === "shorts-pick-v1")
    return config.llm === undefined ? undefined : { ...config.llm, family: "llm" };
  if (input.kind === "deferred" && input.operation === "shorts")
    return config.images === undefined ? undefined : { ...config.images, family: "image" };
  // The chapter openers' clips are asked of the image provider's image-to-video model.
  if (input.kind === "deferred" && input.operation === "animate")
    return config.images === undefined
      ? undefined
      : {
          provider: config.images.provider,
          model: config.videoEdit?.animateModel ?? "",
          family: "image",
        };
  if (input.kind !== "deferred") return undefined;
  const family =
    input.operation === "narration-preparation" ||
    input.operation === "narration-description" ||
    input.operation === "image-scenes" ||
    input.operation === "thumbnail-scenes" ||
    input.operation === "image-appearance"
      ? "llm"
      : recipe.stage === "audio"
        ? "tts"
        : recipe.stage === "images" || input.operation === "thumbnail-image"
          ? "image"
          : "llm";
  const choice = family === "tts" ? config.audio : family === "image" ? config.images : config.llm;
  return choice === undefined ? undefined : { ...choice, family };
}
