import type { FingerprintValue } from "../../kernel/runner/work.js";
import { type RunConfig, thumbnailCountOf, thumbnailKey } from "../admission/model.js";
import { usesShortMode } from "../admission/short-mode.js";
import { render } from "../admission/substitute.js";
import type { RevisionContent } from "../revisions/model.js";
import { usesAmbientBed } from "../video/ambient-bed.js";
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
              ? [["short-v1", config.subtitles?.fontId ?? "default", config.title, timing]]
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
  const variants = Array.from({ length: thumbnailCountOf(config) }, (_, index) => index + 1);
  return variants.map((variant) =>
    recipe(
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
            ...castField(castFor(config, config.title, prompt)),
          },
      [
        ...(promptRecipe === undefined ? [] : [promptRecipe.key]),
        ...(reference === undefined ? [] : [reference.key]),
      ],
    ),
  );
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
