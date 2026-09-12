import type { ProviderFamily } from "../../kernel/ports/model.js";
import type { RunConfig } from "../admission/model.js";
import type { ResolvedWorkRecipe } from "./recipe-model.js";

export interface RecipeProviderChoice {
  readonly provider: string;
  readonly model: string;
  readonly family: ProviderFamily;
  readonly voice?: string | undefined;
}

export function recipeProviderChoice(
  recipe: Pick<ResolvedWorkRecipe, "stage" | "input">,
  config: RunConfig,
): RecipeProviderChoice | undefined {
  const input = recipe.input;
  if (input.kind === "llm" || input.kind === "tts" || input.kind === "image")
    return { ...input, family: input.kind };
  if (input.kind !== "deferred") return undefined;
  const family =
    recipe.stage === "audio"
      ? "tts"
      : recipe.stage === "images" || input.operation === "thumbnail-image"
        ? "image"
        : "llm";
  const choice = family === "tts" ? config.audio : family === "image" ? config.images : config.llm;
  return choice === undefined ? undefined : { ...choice, family };
}
