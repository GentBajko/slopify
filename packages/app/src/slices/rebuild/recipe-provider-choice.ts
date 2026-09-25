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
  if (input.kind !== "deferred") return undefined;
  const family =
    input.operation === "narration-preparation"
      ? "llm"
      : recipe.stage === "audio"
        ? "tts"
        : recipe.stage === "images" || input.operation === "thumbnail-image"
          ? "image"
          : "llm";
  const choice = family === "tts" ? config.audio : family === "image" ? config.images : config.llm;
  return choice === undefined ? undefined : { ...choice, family };
}
