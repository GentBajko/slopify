import { audioRecipes } from "./recipe-audio.js";
import { exportRecipes } from "./recipe-exports.js";
import type { RecipeContext, ResolvedWorkRecipe } from "./recipe-model.js";
import { textRecipes } from "./recipe-text.js";
import { thumbnailRecipes, visualAssets, visualRecipes } from "./recipe-visual.js";

export function buildRecipes(context: RecipeContext): readonly ResolvedWorkRecipe[] {
  const text = textRecipes(context);
  const audio = audioRecipes(context, text);
  const exports = exportRecipes(context, audio);
  const captions = exports.find((value) => value.key === "subtitles:files");
  return [
    ...text.recipes,
    ...audio.recipes,
    ...exports,
    ...thumbnailRecipes(context, text.recipes),
    ...visualAssets(
      context,
      visualRecipes(
        context.config,
        context.content,
        audio.timelineFingerprint,
        captions?.fingerprint ?? null,
      ),
    ),
  ];
}
