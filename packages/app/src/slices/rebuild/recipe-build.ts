import { audioRecipes } from "./recipe-audio.js";
import { documentRecipes } from "./recipe-document.js";
import { exportRecipes } from "./recipe-exports.js";
import type { RecipeContext, ResolvedWorkRecipe } from "./recipe-model.js";
import { textRecipes } from "./recipe-text.js";
import { thumbnailRecipes, visualAssets, visualRecipes } from "./recipe-visual.js";
import { youtubeRecipes } from "./recipe-youtube.js";

export function buildRecipes(context: RecipeContext): readonly ResolvedWorkRecipe[] {
  const text = textRecipes(context);
  const audio = audioRecipes(context, text);
  const exports = exportRecipes(context, audio);
  const captions = exports.find((value) => value.key === "subtitles:files");
  const thumbnail = thumbnailRecipes(context, text.recipes);
  return [
    ...text.recipes,
    ...audio.recipes,
    ...exports,
    ...youtubeRecipes(context, exports),
    ...thumbnail,
    ...documentRecipes(context, text, thumbnail),
    ...visualAssets(
      context,
      visualRecipes(
        context.config,
        context.content,
        audio.mediaFingerprint,
        captions?.fingerprint ?? null,
      ),
    ),
  ];
}
