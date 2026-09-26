import { audioRecipes } from "./recipe-audio.js";
import { documentRecipes } from "./recipe-document.js";
import { editPlan } from "./recipe-edit.js";
import { exportRecipes } from "./recipe-exports.js";
import type { RecipeContext, ResolvedWorkRecipe } from "./recipe-model.js";
import { shortsRecipes } from "./recipe-shorts.js";
import { textRecipes } from "./recipe-text.js";
import { thumbnailRecipes, visualAssets, visualRecipes } from "./recipe-visual.js";
import { youtubeRecipes } from "./recipe-youtube.js";

export function buildRecipes(context: RecipeContext): readonly ResolvedWorkRecipe[] {
  const text = textRecipes(context);
  const audio = audioRecipes(context, text);
  const exports = exportRecipes(context, audio);
  const captions = exports.find((value) => value.key === "subtitles:files");
  const thumbnail = thumbnailRecipes(context, text.recipes);
  const youtube = youtubeRecipes(context, exports);
  return [
    ...text.recipes,
    ...audio.recipes,
    ...exports,
    ...youtube,
    ...shortsRecipes(context, exports),
    ...thumbnail,
    ...documentRecipes(context, text, thumbnail),
    ...visualAssets(
      context,
      visualRecipes(
        context.config,
        context.content,
        audio.mediaFingerprint,
        captions?.fingerprint ?? null,
        (images) => editPlan(context, exports, youtube, images),
      ),
    ),
  ];
}
