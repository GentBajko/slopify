import type { FingerprintValue } from "../../kernel/runner/work.js";
import { type RunConfig, subjectOf, thumbnailCountOf, thumbnailKey } from "../admission/model.js";
import { usesShortMode } from "../admission/short-mode.js";
import { render } from "../admission/substitute.js";
import { withoutScene, withScene } from "../images/scenes.js";
import type { RevisionContent } from "../revisions/model.js";
import { usesAmbientBed } from "../video/ambient-bed.js";
import { type ImageAppearance, lookWait, withLooks } from "./recipe-appearance.js";
import { castFor } from "./recipe-cast.js";
import type { EditPlan } from "./recipe-edit.js";
import { type MasterPlan, noMaster } from "./recipe-loudness.js";
import {
  type RecipeContext,
  type ResolvedWorkRecipe,
  recipe,
  resourceIdentity,
} from "./recipe-model.js";
import { castField, type ImageReference, imageChoice } from "./recipe-reference.js";
import type { ImageScenes, ThumbnailScenes } from "./recipe-scenes.js";
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
  // The word timing's identity, which a short's captions are drawn from.
  timing: FingerprintValue = null,
  // Level the volume: the levelled narration and the master (`recipe-loudness.ts`).
  master: MasterPlan = noMaster,
  // Each image's own scene, for the images whose prompt asks for one (`recipe-scenes.ts`).
  scenes?: ImageScenes,
  // How the subject and characters look, for prompts with `{{Appearance}}`.
  appearance?: ImageAppearance,
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
    const at = scenes?.keys.indexOf(key) ?? -1;
    if (scenes !== undefined && at !== -1 && image.source === "generate") {
      recipes.push(
        sceneImage(
          config,
          content,
          key,
          raw ?? image.prompt ?? "",
          scenes,
          at,
          reference,
          appearance,
        ),
      );
      continue;
    }
    // With Scenes from the article off, a prompt's `{{Scene}}` line is left out.
    const written =
      raw === undefined || raw === null
        ? image.prompt === null || image.prompt === undefined
          ? image.prompt
          : withoutScene(image.prompt)
        : render(withoutScene(raw), config.values);
    const prompt =
      written === null || written === undefined || image.source !== "generate"
        ? written
        : withLooks(written, appearance);
    // Waiting for the looks: the same wait an image with a scene has, on the lookup instead.
    if (prompt === null && written !== null && written !== undefined) {
      const wait = lookWait(written, appearance);
      recipes.push(
        recipe(
          { content },
          `image:${key}`,
          "images",
          {
            kind: "deferred",
            version: 1,
            operation: "image-scene",
            template: [
              ...wait.template,
              written,
              config.images?.provider ?? null,
              config.images?.model ?? null,
              config.format,
              ...(config.images?.thinking === undefined ? [] : [config.images.thinking]),
              ...(reference === undefined ? [] : [reference.input.fingerprint]),
            ],
          },
          [...wait.dependsOn, ...(reference === undefined ? [] : [reference.key])],
        ),
      );
      continue;
    }
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
              ...castField(castFor(config, prompt)),
            },
        image.source === "provide" || reference === undefined ? [] : [reference.key],
        { unresolved: image.source === "provide" ? image.assetId === null : !prompt?.trim() },
      ),
    );
  }
  if (config.sources.video !== "off") {
    const short = usesShortMode(config);
    // A short is rendered by the Shorts renderer, which has no cuts, transitions or Look.
    const edited = (short ? undefined : edit?.([...recipes])) ?? {
      recipes: [],
      values: [],
      dependsOn: [],
    };
    // A short (rendered by the Shorts renderer) never has the bed.
    const bed = short ? undefined : ambientBedValues(config, content);
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
            // Only for a short, so every long video keeps its fingerprint: the word-by-word
            // captions are drawn from the word timing in the caption font, under the title.
            ...(short
              ? [["short-v1", config.subtitles?.fontId ?? "default", subjectOf(config), timing]]
              : []),
            // Only while the video has an ambient bed, so every video without one keeps the
            // fingerprint it always had.
            ...(bed === undefined ? [] : [bed]),
            // Only while the volume is levelled, so every video without it keeps its fingerprint.
            ...master.values,
          ],
        },
        [
          ...recipes.map((value) => value.key),
          ...audioKeys,
          ...master.keys,
          ...(config.subtitles?.mode === "burn-in" ? ["subtitles:files"] : []),
          ...(short ? ["subtitles:timing"] : []),
          ...edited.dependsOn,
        ],
        {
          unresolved:
            imageKeys.length === 0 ||
            (config.ambientBed?.source === "upload" && content.ambientBed === undefined),
        },
      ),
    );
    // After the export, so the images' recipes above stay the only ones its first values list.
    recipes.splice(recipes.length - 1, 0, ...edited.recipes);
  }
  return recipes;
}
// An image drawn from its own scene. Until the scenes are written it waits as a deferred
// request that names the scenes step and the image's place among them, so writing them turns
// it into its image request (materialization), and writing them again draws it again.
function sceneImage(
  config: RunConfig,
  content: RevisionContent,
  key: string,
  body: string,
  scenes: ImageScenes,
  at: number,
  reference: ImageReference | undefined,
  appearance: ImageAppearance | undefined,
): ResolvedWorkRecipe {
  const scene = scenes.scenes?.[at];
  const prompt =
    scene === undefined
      ? undefined
      : (withLooks(withScene(render(body, config.values), scene), appearance, scene) ?? undefined);
  const wait = lookWait(body, appearance);
  return recipe(
    { content },
    `image:${key}`,
    "images",
    prompt === undefined
      ? {
          kind: "deferred",
          version: 1,
          operation: "image-scene",
          template: [
            scenes.recipe.fingerprint,
            at,
            config.images?.provider ?? null,
            config.images?.model ?? null,
            config.format,
            ...(config.images?.thinking === undefined ? [] : [config.images.thinking]),
            ...(reference === undefined ? [] : [reference.input.fingerprint]),
            ...wait.template,
          ],
        }
      : {
          kind: "image",
          version: 1,
          ...imageChoice(config),
          aspect: config.format,
          prompt,
          ...(reference === undefined ? {} : { reference: reference.input }),
          ...castField(castFor(config, prompt)),
        },
    [scenes.recipe.key, ...wait.dependsOn, ...(reference === undefined ? [] : [reference.key])],
  );
}

// What the ambient bed adds to the render's fingerprint: its settings and, for the user's own
// file, the project asset it plays. Undefined without a bed.
export function ambientBedValues(
  config: RunConfig,
  content: Pick<RevisionContent, "ambientBed">,
): FingerprintValue | undefined {
  const bed = config.ambientBed;
  if (bed === undefined || !usesAmbientBed(config)) return undefined;
  return [
    "ambient-bed-v1",
    bed.source,
    bed.levelDb,
    bed.fadeInSeconds,
    bed.tailSeconds,
    bed.source === "upload" ? (content.ambientBed ?? null) : null,
  ];
}

export function thumbnailRecipes(
  context: RecipeContext,
  textRecipes: readonly ResolvedWorkRecipe[],
  // The establishing image, when it is on and the thumbnail is drawn from it too.
  reference?: ImageReference,
  // Scenes from the article: a thumbnail prompt with `{{Scene}}` takes one per thumbnail.
  scenes?: ThumbnailScenes,
  // How the subject and characters look, for a prompt with `{{Appearance}}`.
  appearance?: ImageAppearance,
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
          semantic: [subjectOf(config), config.format],
        },
        [],
        { unresolved: content.provided.thumbnail === undefined },
      ),
    ];
  const promptRecipe = textRecipes.find((value) => value.key === "thumbnail:prompt");
  const written =
    config.sources.thumbnail === "prompt_by_llm" && promptRecipe !== undefined
      ? matchingText(context, promptRecipe, "prompt")
      : renderedPrompt(context, "thumbnailPrompt");
  const sceneFor = (variant: number): string | undefined => scenes?.scenes?.[variant - 1];
  const withScenes = scenes !== undefined;
  const variants = Array.from({ length: thumbnailCountOf(config) }, (_, index) => index + 1);
  return variants.map((variant) => {
    const scene = sceneFor(variant);
    // With a scene the thumbnail waits for it; with the switch off a `{{Scene}}` line is left
    // out, as the images do.
    const sceneFilled =
      written === null
        ? null
        : withScenes
          ? scene === undefined
            ? null
            : withScene(written, scene)
          : withoutScene(written);
    // A thumbnail stands for the subject, so it always has the subject's look.
    const prompt =
      sceneFilled === null
        ? null
        : withLooks(sceneFilled, appearance, scene, { subjectAlways: true });
    const wait = lookWait(written, appearance);
    return recipe(
      context,
      thumbnailKey(variant),
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
              ...(variant === 1 ? [] : [["thumbnail-variant", variant]]),
              ...(withScenes ? [["thumbnail-scene", scenes.recipe.fingerprint]] : []),
              ...wait.template,
            ],
          }
        : {
            kind: "image",
            version: 1,
            ...imageChoice(config),
            aspect: config.format,
            prompt: thumbnailVariantPrompt(prompt, variant),
            ...(reference === undefined ? {} : { reference: reference.input }),
            // The thumbnail stands for the whole video, like the establishing image.
            ...castField(castFor(config, subjectOf(config), prompt)),
          },
      [
        ...(promptRecipe === undefined ? [] : [promptRecipe.key]),
        ...(reference === undefined ? [] : [reference.key]),
        ...(withScenes ? [scenes.recipe.key] : []),
        ...wait.dependsOn,
      ],
    );
  });
}

// The second and third thumbnails are the same prompt asked for another composition, so the
// three test one idea against itself rather than three ideas. The first is the prompt as it
// is, which keeps the thumbnail every project already has.
const variantFraming: Readonly<Record<number, string>> = {
  2: "a tight close-up where the main subject fills most of the frame, seen from a different angle",
  3: "a wider shot that shows the main subject in its setting, placed off-centre with room around it",
};
export function thumbnailVariantPrompt(prompt: string, variant: number): string {
  const framing = variantFraming[variant];
  if (framing === undefined) return prompt;
  return `${prompt}\n\nThis is thumbnail ${String(variant)} of 3 for a YouTube thumbnail test. Keep the subject, style, colours and any text asked for above, but use a clearly different composition: ${framing}.`;
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
