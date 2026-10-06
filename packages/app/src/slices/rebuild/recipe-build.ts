import { referenceForThumbnail } from "../admission/rules.js";
import { imageAppearance } from "./recipe-appearance.js";
import { audioRecipes } from "./recipe-audio.js";
import { documentRecipes } from "./recipe-document.js";
import { editPlan } from "./recipe-edit.js";
import { exportRecipes } from "./recipe-exports.js";
import { linePlan } from "./recipe-lines.js";
import { masterPlan } from "./recipe-loudness.js";
import { type RecipeContext, type ResolvedWorkRecipe, resourceIdentity } from "./recipe-model.js";
import { imageReference, referenceRecipe } from "./recipe-reference.js";
import { withReviews } from "./recipe-reviews.js";
import { imageScenes, thumbnailScenes } from "./recipe-scenes.js";
import { shortsRecipes } from "./recipe-shorts.js";
import { textRecipes } from "./recipe-text.js";
import { thumbnailRecipes, visualAssets, visualRecipes } from "./recipe-visual.js";
import { youtubeRecipes } from "./recipe-youtube.js";

// The video's sound: mastered, and on a multi-voice run levelled line by line first.
function withLines(
  master: ReturnType<typeof masterPlan>,
  lines: ReturnType<typeof linePlan>,
): ReturnType<typeof masterPlan> {
  return lines.keys.length === 0
    ? master
    : { values: [...master.values, ...lines.values], keys: [...master.keys, ...lines.keys] };
}

// Every recipe of a version. A finished video whose only change is a description written again
// keeps the description its chapter cards were drawn from: the video is never remade for a new
// description, only when what it shows changes.
export function buildRecipes(context: RecipeContext): readonly ResolvedWorkRecipe[] {
  const built = buildEach(context);
  const video = built.find((value) => value.key === "export:video");
  const rendered = new Set(
    context.manifest.pieces
      .filter((one) => one.key === "export:video" && one.piece.state === "done")
      .map((one) => one.fingerprint),
  );
  if (video === undefined || rendered.size === 0 || rendered.has(video.fingerprint)) return built;
  if (!video.dependsOn.includes(descriptionKey)) return built;
  const past = context.history ?? context.manifest;
  const fingerprints = new Set(
    past.pieces.filter((one) => one.key === descriptionKey).map((one) => one.fingerprint),
  );
  const assets = new Set<string | null>([
    null,
    ...past.outputs.filter((one) => one.workKey === descriptionKey).map((one) => one.assetId),
    ...past.pieces.filter((one) => one.key === descriptionKey).map((one) => one.assetId),
  ]);
  for (const described of fingerprints)
    for (const asset of assets) {
      const kept = buildEach({ ...context, pinnedChapters: [described, asset] }).find(
        (value) => value.key === "export:video",
      );
      if (kept !== undefined && rendered.has(kept.fingerprint))
        return built.map((value) => (value.key === "export:video" ? kept : value));
    }
  return built;
}

const descriptionKey = "youtube:description";

function buildEach(context: RecipeContext): readonly ResolvedWorkRecipe[] {
  const text = textRecipes(context);
  const audio = audioRecipes(context, text);
  const exports = exportRecipes(context, audio);
  const captions = exports.find((value) => value.key === "subtitles:files");
  const timing = exports.find((value) => value.key === "subtitles:timing");
  // How the subject and characters look, looked up when a prompt has `{{Appearance}}`.
  const appearance = imageAppearance(context, text);
  // The establishing image, when it is on: every other image is drawn from it.
  const reference = referenceRecipe(context, appearance);
  const drawnFrom = imageReference(context, reference);
  // Each image's scene, written from the article, and the thumbnails' in a step of their own
  // when their prompt asks.
  const scenes = imageScenes(context, text);
  const thumbnailScened = thumbnailScenes(context, text);
  const thumbnail = thumbnailRecipes(
    context,
    text.recipes,
    referenceForThumbnail(context.config) ? drawnFrom : undefined,
    thumbnailScened,
    appearance,
  );
  const youtube = youtubeRecipes(context, exports);
  return withReviews(context, [
    ...text.recipes,
    ...audio.recipes,
    ...exports,
    ...youtube,
    ...(reference === undefined ? [] : [reference]),
    ...shortsRecipes(
      context,
      exports,
      drawnFrom,
      audio.cards ?? [],
      masterPlan(context, audio.levels, "video"),
      appearance,
    ),
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
        withLines(masterPlan(context, audio.levels, "video"), linePlan(context, timing)),
        scenes,
        appearance,
      ),
    ),
    ...(scenes === undefined ? [] : [scenes.recipe]),
    ...(thumbnailScened === undefined ? [] : [thumbnailScened.recipe]),
    ...(appearance === undefined ? [] : [appearance.recipe]),
  ]);
}
