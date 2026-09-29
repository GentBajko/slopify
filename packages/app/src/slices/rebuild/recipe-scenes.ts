import { z } from "zod";
import { withLanguage } from "../../kernel/ports/languages.js";
import { pictureKind, sceneMessages } from "../images/scenes.js";
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
  if (keys.length === 0) return undefined;
  const messages = withLanguage(
    sceneMessages({ title: config.title, article: text.articleText ?? "", pictures }),
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
  return {
    recipe: value,
    keys,
    scenes: text.articleText === null ? undefined : savedScenes(context, value, keys.length),
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
