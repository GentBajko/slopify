import { z } from "zod";
import { withLanguage } from "../../kernel/ports/languages.js";
import { thumbnailCountOf } from "../admission/model.js";
import { pictureKind, sceneMessages, usesScene } from "../images/scenes.js";
import {
  type RecipeContext,
  type ResolvedWorkRecipe,
  recipe,
  selectedReference,
} from "./recipe-model.js";
import { llmInput, llmInputFingerprint } from "./recipe-text.js";

// The step that writes each image's scene while Images → Scenes from the article is on
// (`images/scenes.ts`), and the scenes it wrote once they answer this plan's request.
export interface ImageScenes {
  readonly recipe: ResolvedWorkRecipe;
  // The images that take a scene, in slideshow order; scene N belongs to image N here.
  readonly keys: readonly string[];
  // Undefined until the step has written them for this request.
  readonly scenes: readonly string[] | undefined;
  // How many thumbnails take a scene (their prompt has `{{Scene}}`), and their scenes, which
  // follow the images' in the answer. Undefined until written.
  readonly thumbnailCount: number;
  readonly thumbnails: readonly string[] | undefined;
}

// A thumbnail drawn from a Library prompt whose text asks for `{{Scene}}` takes one scene per
// thumbnail; any other thumbnail is drawn as it always was.
export function thumbnailScenes(context: RecipeContext): number {
  const { config, content } = context;
  if (config.sources.thumbnail !== "from_prompt") return 0;
  const body = content.promptTemplates.thumbnailPrompt ?? config.rendered.thumbnailPrompt;
  return usesScene(body) ? thumbnailCountOf(config) : 0;
}

export const imageScenesKey = "images:scenes";

export function imageScenes(
  context: RecipeContext,
  text: { readonly articleText: string | null; readonly article: ResolvedWorkRecipe },
): ImageScenes | undefined {
  const { config, content } = context;
  if (config.sources.images !== "generate" || config.imageScenes !== true) return undefined;
  const keys: string[] = [];
  const pictures: string[] = [];
  for (const key of content.imageOrder) {
    const image = content.imageDefinitions[key];
    if (image?.source !== "generate") continue;
    const body =
      image.templateKey == null
        ? image.prompt
        : (content.promptTemplates[image.templateKey] ?? image.prompt);
    if (body == null || body.trim() === "") continue;
    const at = /^imagePrompts\.(\d+)$/.exec(image.templateKey ?? "")?.[1];
    const name = at === undefined ? "Image" : (config.imagePrompts[Number(at)]?.name ?? "Image");
    keys.push(key);
    pictures.push(pictureKind(body, name));
  }
  const thumbnailCount = thumbnailScenes(context);
  if (keys.length === 0 && thumbnailCount === 0) return undefined;
  const messages = withLanguage(
    sceneMessages({
      title: config.title,
      article: text.articleText ?? "",
      pictures,
      ...(thumbnailCount === 0 ? {} : { thumbnails: thumbnailCount }),
    }),
    config.language,
  );
  const value = recipe(
    context,
    imageScenesKey,
    "images",
    text.articleText === null
      ? {
          kind: "deferred",
          version: 1,
          operation: "image-scenes",
          template: [llmInputFingerprint(context, messages), text.article.fingerprint],
        }
      : llmInput(context, messages),
    [text.article.key],
  );
  const saved =
    text.articleText === null
      ? undefined
      : savedScenes(context, value, keys.length + thumbnailCount);
  return {
    recipe: value,
    keys,
    scenes: saved?.slice(0, keys.length),
    thumbnailCount,
    thumbnails: saved?.slice(keys.length),
  };
}

// The scenes saved for this request. The request carries the model's thinking settings from
// the catalogue, which the plan without a catalogue has not got, so either fingerprint
// matches (like the shorts' saved prompts).
function savedScenes(
  context: RecipeContext,
  value: ResolvedWorkRecipe,
  count: number,
): readonly string[] | undefined {
  const logical =
    context.catalogue === undefined || value.input.kind !== "llm"
      ? value.fingerprint
      : recipe(
          { content: context.content },
          value.key,
          value.stage,
          { ...value.input, thinkingConfig: null },
          value.dependsOn,
        ).fingerprint;
  const piece = context.manifest.pieces.find(
    (row) =>
      row.key === value.key &&
      selectedReference(row) &&
      row.piece.state === "done" &&
      (row.fingerprint === value.fingerprint || row.fingerprint === logical),
  );
  if (piece?.piece.payload == null) return undefined;
  const parsed = z
    .object({ scenes: z.array(z.string()) })
    .safeParse(JSON.parse(piece.piece.payload));
  return parsed.success && parsed.data.scenes.length === count ? parsed.data.scenes : undefined;
}
