import { type RunConfig, referenceKey } from "../admission/model.js";
import { usesReference } from "../admission/rules.js";
import {
  type RecipeContext,
  type ResolvedWorkRecipe,
  recipe,
  selectedAsset,
} from "./recipe-model.js";
import { renderedPrompt } from "./recipe-text.js";

// The establishing image (`RunDraft.reference`): one step of the Images stage, made before
// every other image of the run and never part of the video. Made from its library prompt, whose
// keywords are filled like every other image prompt's, or the file the user uploaded.
export const referencePromptKey = "referencePrompt";

// What an image request carries while the establishing image is on, and the step it waits for.
export interface ImageReference {
  readonly key: string;
  readonly input: { readonly fingerprint: string; readonly assetId: string | null };
}

// The image provider's choice as an image request carries it: the effort only when one is set,
// so a request made without one keeps the fingerprint it always had.
export function imageChoice(config: Pick<RunConfig, "images">): {
  readonly provider: string;
  readonly model: string;
  readonly thinking?: NonNullable<RunConfig["images"]>["thinking"];
} {
  return {
    provider: config.images?.provider ?? "",
    model: config.images?.model ?? "",
    ...(config.images?.thinking === undefined ? {} : { thinking: config.images.thinking }),
  };
}

export function referenceRecipe(context: RecipeContext): ResolvedWorkRecipe | undefined {
  const { config, content } = context;
  if (!usesReference(config) || config.reference === undefined) return undefined;
  if (config.reference.source === "provide")
    return recipe(
      context,
      referenceKey,
      "images",
      {
        kind: "provided",
        version: 1,
        assetId: content.provided.reference ?? null,
        semantic: "reference",
      },
      [],
      { unresolved: content.provided.reference === undefined },
    );
  const prompt = renderedPrompt(context, referencePromptKey);
  return recipe(
    context,
    referenceKey,
    "images",
    { kind: "image", version: 1, ...imageChoice(config), aspect: config.format, prompt },
    [],
    { unresolved: prompt.trim() === "" },
  );
}

// Which image the others are drawn from: the step's fingerprint, so making it again or
// changing it marks every image drawn from it outdated, and the asset it made.
export function imageReference(
  context: RecipeContext,
  reference: ResolvedWorkRecipe | undefined,
): ImageReference | undefined {
  return reference === undefined
    ? undefined
    : {
        key: reference.key,
        input: {
          fingerprint: reference.fingerprint,
          assetId: selectedAsset(context, reference.key, reference.fingerprint),
        },
      };
}
