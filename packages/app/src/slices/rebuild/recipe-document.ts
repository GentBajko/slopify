import type { FingerprintValue } from "../../kernel/runner/work.js";
import { sourceOf } from "../admission/model.js";
import { documentThemeOf } from "../document/model.js";
import { builtInTheme } from "../document/theme.js";
import {
  type RecipeContext,
  type ResolvedWorkRecipe,
  recipe,
  resourceIdentity,
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
  const theme = builtInTheme(documentThemeOf(config.document));
  return [
    recipe(
      context,
      "document:pdf",
      "document",
      {
        kind: "local",
        version: 1,
        operation: "render-document",
        values: [
          renderer,
          config.title,
          JSON.parse(JSON.stringify(theme)) as FingerprintValue,
          resourceIdentity(context, text.article),
          notes === undefined ? null : resourceIdentity(context, notes),
          cover === undefined ? null : resourceIdentity(context, cover),
        ],
      },
      [
        text.article.key,
        ...[notes, cover].flatMap((value) => (value === undefined ? [] : [value.key])),
      ],
    ),
  ];
}
