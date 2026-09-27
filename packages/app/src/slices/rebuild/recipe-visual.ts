import type { RunConfig } from "../admission/model.js";
import { render } from "../admission/substitute.js";
import type { RevisionContent } from "../revisions/model.js";
import type { EditPlan } from "./recipe-edit.js";
import {
  type RecipeContext,
  type ResolvedWorkRecipe,
  recipe,
  resourceIdentity,
} from "./recipe-model.js";
import { type ImageReference, imageChoice } from "./recipe-reference.js";
import { matchingText, renderedPrompt } from "./recipe-text.js";

export function visualRecipes(
  config: RunConfig,
  content: RevisionContent,
  audioFingerprint: string | null,
  captionFingerprint: string | null,
  // What the Video stage's edit settings add (`recipe-edit.ts`), from the images planned here.
  edit?: (images: readonly ResolvedWorkRecipe[]) => EditPlan,
  // The establishing image the generated images are drawn from, when it is on.
  reference?: ImageReference,
): readonly ResolvedWorkRecipe[] {
  const recipes: ResolvedWorkRecipe[] = [];
  const imageKeys = config.sources.images === "off" ? [] : content.imageOrder;
  for (const key of imageKeys) {
    const image = content.imageDefinitions[key];
    if (image === undefined)
      throw new Error(
        "Slopify hit an internal error (one of the project's images has no saved settings). Try again; if it happens again, use Download diagnostics in Settings and report it.",
      );
    const raw =
      image.templateKey === undefined || image.templateKey === null
        ? undefined
        : content.promptTemplates[image.templateKey];
    const prompt = raw === undefined || raw === null ? image.prompt : render(raw, config.values);
    recipes.push(
      recipe(
        { content },
        `image:${key}`,
        "images",
        image.source === "provide"
          ? { kind: "provided", version: 1, assetId: image.assetId, semantic: null }
          : {
              kind: "image",
              version: 1,
              ...imageChoice(config),
              aspect: config.format,
              prompt: prompt ?? "",
              ...(reference === undefined ? {} : { reference: reference.input }),
            },
        image.source === "provide" || reference === undefined ? [] : [reference.key],
        { unresolved: image.source === "provide" ? image.assetId === null : !prompt?.trim() },
      ),
    );
  }
  if (config.sources.video !== "off") {
    const edited = edit?.([...recipes]) ?? { recipes: [], values: [], dependsOn: [] };
    const audioKeys =
      config.sources.audio === "off"
        ? []
        : [
            config.sources.audio === "provide" ? "audio:provided" : "audio:body:concat",
            ...(config.sources.audio === "generate" && config.intro !== undefined
              ? ["audio:intro"]
              : []),
            ...(config.sources.audio === "generate" && config.outro !== undefined
              ? ["audio:outro"]
              : []),
          ];
    recipes.push(
      recipe(
        { content },
        "export:video",
        "video",
        {
          kind: "local",
          version: 1,
          operation: "render-video",
          values: [
            config.format,
            config.silenceGapSeconds,
            recipes.map((value) => value.fingerprint),
            audioFingerprint,
            config.subtitles?.mode === "burn-in" ? captionFingerprint : null,
            // Only here: how long a still is held and how it moves change the render,
            // never an image.
            config.imageSeconds,
            config.zoomPercent,
            // Left out for "zoom", which is what every video did before the setting
            // existed, so a project that keeps it keeps its render; the other styles
            // each render differently.
            ...(config.motionStyle === "zoom" ? [] : [config.motionStyle]),
            // v1 split the timeline evenly across the images; v2 cycles them.
            "slideshow-zoom-v2",
            // Only what the edit settings change; nothing at all for today's slideshow, so
            // its fingerprint is the one it always had.
            ...(edited.values.length === 0 ? [] : [["video-edit", ...edited.values]]),
          ],
        },
        [
          ...recipes.map((value) => value.key),
          ...audioKeys,
          ...(config.subtitles?.mode === "burn-in" ? ["subtitles:files"] : []),
          ...edited.dependsOn,
        ],
        { unresolved: imageKeys.length === 0 },
      ),
    );
    // After the export, so the images' recipes above stay the only ones its first values list.
    recipes.splice(recipes.length - 1, 0, ...edited.recipes);
  }
  return recipes;
}
export function thumbnailRecipes(
  context: RecipeContext,
  textRecipes: readonly ResolvedWorkRecipe[],
  // The establishing image, when it is on and the thumbnail is drawn from it too.
  reference?: ImageReference,
): readonly ResolvedWorkRecipe[] {
  const { config, content } = context;
  if (config.sources.thumbnail === "off") return [];
  if (config.sources.thumbnail === "provide")
    return [
      recipe(
        context,
        "thumbnail:image",
        "thumbnail",
        {
          kind: "provided",
          version: 1,
          assetId: content.provided.thumbnail ?? null,
          semantic: [config.title, config.format],
        },
        [],
        { unresolved: content.provided.thumbnail === undefined },
      ),
    ];
  const promptRecipe = textRecipes.find((value) => value.key === "thumbnail:prompt");
  const prompt =
    config.sources.thumbnail === "prompt_by_llm" && promptRecipe !== undefined
      ? matchingText(context, promptRecipe, "prompt")
      : renderedPrompt(context, "thumbnailPrompt");
  return [
    recipe(
      context,
      "thumbnail:image",
      "thumbnail",
      prompt === null
        ? {
            kind: "deferred",
            version: 1,
            operation: "thumbnail-image",
            template: [
              promptRecipe?.fingerprint ?? null,
              config.images?.provider ?? null,
              config.images?.model ?? null,
              config.format,
              // Only what is in use, so a thumbnail made before these existed keeps its
              // fingerprint.
              ...(config.images?.thinking === undefined ? [] : [config.images.thinking]),
              ...(reference === undefined ? [] : [reference.input.fingerprint]),
            ],
          }
        : {
            kind: "image",
            version: 1,
            ...imageChoice(config),
            aspect: config.format,
            prompt,
            ...(reference === undefined ? {} : { reference: reference.input }),
          },
      [
        ...(promptRecipe === undefined ? [] : [promptRecipe.key]),
        ...(reference === undefined ? [] : [reference.key]),
      ],
    ),
  ];
}
export function visualAssets(
  context: RecipeContext,
  recipes: readonly ResolvedWorkRecipe[],
): readonly ResolvedWorkRecipe[] {
  const images = recipes.filter((value) => value.stage === "images");
  return recipes.map((value) =>
    value.key !== "export:video"
      ? value
      : recipe(
          context,
          value.key,
          value.stage,
          {
            kind: "local",
            version: 1,
            operation: "render-selected-video",
            values: [
              value.requestFingerprint,
              images.map((image) => resourceIdentity(context, image)),
            ],
          },
          value.dependsOn,
          { unresolved: value.unresolved },
        ),
  );
}
