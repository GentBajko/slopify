import { withLanguage } from "../../kernel/ports/languages.js";
import type { FingerprintValue } from "../../kernel/runner/work.js";
import {
  type Appearance,
  appearanceFor,
  appearanceMessages,
  appearanceSchema,
  usesAppearance,
  withAppearance,
} from "../images/appearance.js";
import {
  type RecipeContext,
  type ResolvedWorkRecipe,
  recipe,
  selectedReference,
} from "./recipe-model.js";
import { llmInput, llmInputFingerprint } from "./recipe-text.js";

// The step that looks up how the subject and characters look, when an image, thumbnail or
// establishing prompt has `{{Appearance}}` (`images/appearance.ts`), and the looks it found once
// they answer this plan's request.
export interface ImageAppearance {
  readonly recipe: ResolvedWorkRecipe;
  // Undefined until the step has looked them up for this request.
  readonly value: Appearance | undefined;
}

export const imageAppearanceKey = "images:appearance";

// The prompt bodies a run draws pictures from: the generated images', the thumbnail's when it
// is drawn from a Library prompt, and the establishing image's.
function pictureBodies(context: RecipeContext): readonly (string | null | undefined)[] {
  const { config, content } = context;
  const images =
    config.sources.images === "generate"
      ? content.imageOrder.flatMap((key) => {
          const image = content.imageDefinitions[key];
          if (image?.source !== "generate") return [];
          return [
            image.templateKey == null
              ? image.prompt
              : (content.promptTemplates[image.templateKey] ?? image.prompt),
          ];
        })
      : [];
  return [
    ...images,
    ...(config.sources.thumbnail === "from_prompt"
      ? [content.promptTemplates.thumbnailPrompt ?? config.rendered.thumbnailPrompt]
      : []),
    ...(config.sources.images === "generate" && config.reference?.source === "prompt"
      ? [content.promptTemplates.referencePrompt ?? config.rendered.referencePrompt]
      : []),
  ];
}

export function imageAppearance(
  context: RecipeContext,
  text: { readonly articleText: string | null; readonly article: ResolvedWorkRecipe },
): ImageAppearance | undefined {
  const { config } = context;
  if (!pictureBodies(context).some(usesAppearance)) return undefined;
  const messages = withLanguage(
    appearanceMessages({ title: config.title, article: text.articleText ?? "" }),
    config.language,
  );
  const value = recipe(
    context,
    imageAppearanceKey,
    config.sources.images === "generate" ? "images" : "thumbnail",
    text.articleText === null
      ? {
          kind: "deferred",
          version: 1,
          operation: "image-appearance",
          template: [llmInputFingerprint(context, messages), text.article.fingerprint],
        }
      : llmInput(context, messages, true),
    [text.article.key],
  );
  return {
    recipe: value,
    value: text.articleText === null ? undefined : savedAppearance(context, value),
  };
}

// The looks saved for this request, by either fingerprint (see `savedScenes`).
function savedAppearance(
  context: RecipeContext,
  value: ResolvedWorkRecipe,
): Appearance | undefined {
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
  const payload = JSON.parse(piece.piece.payload) as { appearance?: unknown };
  const parsed = appearanceSchema.safeParse(payload.appearance);
  return parsed.success ? parsed.data : undefined;
}

// A prompt with its looks filled in: the subject's and those of the characters the scene names.
// Null while the looks are still being looked up, so the picture waits for them.
export function withLooks(
  body: string,
  appearance: ImageAppearance | undefined,
  scene?: string,
  options?: { readonly subjectAlways?: boolean },
): string | null {
  if (appearance === undefined || !usesAppearance(body)) return body;
  if (appearance.value === undefined) return null;
  return withAppearance(body, appearanceFor(appearance.value, scene, options));
}

// What a picture waiting for the looks adds to its waiting request, and the step it waits on.
export function lookWait(
  body: string | null | undefined,
  appearance: ImageAppearance | undefined,
): { readonly template: readonly FingerprintValue[]; readonly dependsOn: readonly string[] } {
  return appearance === undefined || !usesAppearance(body)
    ? { template: [], dependsOn: [] }
    : {
        template: [["appearance", appearance.recipe.fingerprint]],
        dependsOn: [appearance.recipe.key],
      };
}
