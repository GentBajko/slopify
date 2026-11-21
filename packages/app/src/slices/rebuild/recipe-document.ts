import type { FingerprintValue } from "../../kernel/runner/work.js";
import { sourceOf, subjectOf } from "../admission/model.js";
import { resolvedDocumentTheme } from "../document/theme.js";
import {
  type RecipeContext,
  type ResolvedWorkRecipe,
  recipe,
  settledRecipe,
} from "./recipe-model.js";
import type { TextRecipes } from "./recipe-text.js";

// Bumped when the renderer's output changes for the same inputs, so documents made by an
// older one read as outdated rather than current.
const renderer = "document-v1";

// The PDF is made from the saved article (whose end matter feeds the Sources page), the
// research notes' links, the thumbnail as a cover and the resolved theme. It waits for
// nothing else, so narration and images run beside it.
export function documentRecipes(
  context: RecipeContext,
  text: TextRecipes,
  thumbnail: readonly ResolvedWorkRecipe[],
): readonly ResolvedWorkRecipe[] {
  const { config } = context;
  if (sourceOf(config.sources, "document") !== "generate") return [];
  const notes = text.recipes.find((value) => value.key === "research:notes");
  const cover = thumbnail.find((value) => value.key === "thumbnail:image");
  const theme = resolvedDocumentTheme(config.document);
  const inputs = [
    text.article,
    ...[notes, cover].flatMap((value) => (value === undefined ? [] : [value])),
  ];
  // The article and notes are several files each; their identity doesn't follow the order a
  // version lists them in (`settledRecipe`).
  return [
    settledRecipe(context, inputs, (identities) => {
      const identity = (value: ResolvedWorkRecipe | undefined) =>
        value === undefined ? null : (identities[inputs.indexOf(value)] ?? null);
      return recipe(
        context,
        "document:pdf",
        "document",
        {
          kind: "local",
          version: 1,
          operation: "render-document",
          values: [
            renderer,
            subjectOf(config),
            JSON.parse(JSON.stringify(theme)) as FingerprintValue,
            identity(text.article),
            identity(notes),
            identity(cover),
          ],
        },
        inputs.map((value) => value.key),
      );
    }),
  ];
}
