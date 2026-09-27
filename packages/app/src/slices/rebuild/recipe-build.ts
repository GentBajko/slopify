import { referenceForThumbnail } from "../admission/rules.js";
import { audioRecipes } from "./recipe-audio.js";
import { documentRecipes } from "./recipe-document.js";
import { editPlan } from "./recipe-edit.js";
import { exportRecipes } from "./recipe-exports.js";
import { type RecipeContext, type ResolvedWorkRecipe, resourceIdentity } from "./recipe-model.js";
import { imageReference, referenceRecipe } from "./recipe-reference.js";
import { withReviews } from "./recipe-reviews.js";
import { shortsRecipes } from "./recipe-shorts.js";
import { textRecipes } from "./recipe-text.js";
import { thumbnailRecipes, visualAssets, visualRecipes } from "./recipe-visual.js";
import { youtubeRecipes } from "./recipe-youtube.js";

export function buildRecipes(context: RecipeContext): readonly ResolvedWorkRecipe[] {
  const text = textRecipes(context);
  const audio = audioRecipes(context, text);
  const exports = exportRecipes(context, audio);
  const captions = exports.find((value) => value.key === "subtitles:files");
  const timing = exports.find((value) => value.key === "subtitles:timing");
  // The establishing image, when it is on: every other image is drawn from it.
  const reference = referenceRecipe(context);
  const drawnFrom = imageReference(context, reference);
  const thumbnail = thumbnailRecipes(
    context,
    text.recipes,
    referenceForThumbnail(context.config) ? drawnFrom : undefined,
  );
  const youtube = youtubeRecipes(context, exports);
  return withReviews(context, [
    ...text.recipes,
    ...audio.recipes,
    ...exports,
    ...youtube,
    ...(reference === undefined ? [] : [reference]),
    ...shortsRecipes(context, exports, drawnFrom, audio.cards ?? []),
    ...thumbnail,
    ...documentRecipes(context, text, thumbnail),
    ...visualAssets(
      context,
      visualRecipes(
        context.config,
        context.content,
        audio.mediaFingerprint,
        captions?.fingerprint ?? null,
        (images) => editPlan(context, exports, youtube, images, audio.cards ?? []),
        drawnFrom,
        timing === undefined ? null : resourceIdentity(context, timing),
      ),
    ),
  ]);
}
