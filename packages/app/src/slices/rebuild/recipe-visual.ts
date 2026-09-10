import type { RunConfig } from "../admission/model.js";
import { render } from "../admission/substitute.js";
import type { RevisionContent } from "../revisions/model.js";
import {
  type RecipeContext,
  type ResolvedWorkRecipe,
  recipe,
  resourceIdentity,
} from "./recipe-model.js";
import { matchingText, renderedPrompt } from "./recipe-text.js";

export function visualRecipes(
  config: RunConfig,
  content: RevisionContent,
  audioFingerprint: string | null,
  captionFingerprint: string | null,
): readonly ResolvedWorkRecipe[] {
  const recipes: ResolvedWorkRecipe[] = [];
  const imageKeys = config.sources.images === "off" ? [] : content.imageOrder;
  for (const key of imageKeys) {
    const image = content.imageDefinitions[key];
    if (image === undefined) throw new Error("Saved image definition is missing");
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
              provider: config.images?.provider ?? "",
              model: config.images?.model ?? "",
              aspect: config.format,
              prompt: prompt ?? "",
            },
        [],
        { unresolved: image.source === "provide" ? image.assetId === null : !prompt?.trim() },
      ),
    );
  }
  if (config.sources.video !== "off") {
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
            "slideshow-zoom-v1",
          ],
        },
        [
          ...recipes.map((value) => value.key),
          ...audioKeys,
          ...(config.subtitles?.mode === "burn-in" ? ["subtitles:files"] : []),
        ],
        { unresolved: imageKeys.length === 0 },
      ),
    );
  }
  return recipes;
}
export function thumbnailRecipes(
  context: RecipeContext,
  textRecipes: readonly ResolvedWorkRecipe[],
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
            ],
          }
        : {
            kind: "image",
            version: 1,
            provider: config.images?.provider ?? "",
            model: config.images?.model ?? "",
            aspect: config.format,
            prompt,
          },
      promptRecipe === undefined ? [] : [promptRecipe.key],
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
