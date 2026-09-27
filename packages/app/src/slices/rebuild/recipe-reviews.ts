import {
  narrationItemKey,
  type ReviewStage,
  reviewKey,
  reviewModeOf,
  reviewPromptKey,
  reviewRetriesOf,
} from "../reviews/model.js";
import { activeReviewStages } from "../reviews/rules.js";
import {
  type RecipeContext,
  type ResolvedWorkRecipe,
  recipe,
  resourceIdentity,
} from "./recipe-model.js";
import { renderedPrompt } from "./recipe-text.js";

interface ReviewedItem {
  readonly stage: ReviewStage;
  readonly itemKey: string;
  // The steps whose outputs the reviewer is shown or compares against.
  readonly inputs: readonly ResolvedWorkRecipe[];
  // The steps whose dependents wait for this review before they run.
  readonly gates: readonly string[];
}

// A review is a step of its own, `review:<item>`, planned like any other: it waits for the
// item, its fingerprint follows the item's output, the reviewer and the prompt, and it is
// kept and reused while those stay the same. What depends on a reviewed item waits for its
// review too, so the run moves on only once the reviewer has answered - the automatic twin
// of a review checkpoint. With every review Off nothing here is added and no step changes.
export function withReviews(
  context: RecipeContext,
  recipes: readonly ResolvedWorkRecipe[],
): readonly ResolvedWorkRecipe[] {
  const settings = context.config.reviews;
  const stages = activeReviewStages(context.config);
  if (settings === undefined || stages.length === 0) return recipes;
  const byKey = new Map(recipes.map((row) => [row.key, row]));
  const items = stages.flatMap((stage) => reviewedItems(stage, recipes, byKey));
  const reviews = items.map((item) =>
    recipe(
      context,
      reviewKey(item.itemKey),
      stageOf(item.stage),
      {
        kind: "local",
        version: 1,
        operation: "review-v1",
        values: [
          item.stage,
          item.itemKey,
          item.inputs.map((input) => [input.key, resourceIdentity(context, input)]),
          settings.provider,
          settings.model,
          settings.thinking ?? null,
          // Blank means the stage's built-in prompt; the step fills it in, so a new built-in
          // wording ships as a new operation version rather than a silent change here.
          settings.stages[item.stage]?.prompt?.trim()
            ? renderedPrompt(context, reviewPromptKey(item.stage))
            : "",
          reviewModeOf(settings, item.stage),
          reviewRetriesOf(settings),
        ],
      },
      item.inputs.map((input) => input.key),
      // A paid LLM call: readiness, the charge warning and the estimate treat it like one.
      { kind: "provider" },
    ),
  );
  const gated = recipes.map((row) => {
    const waits = items.flatMap((item, index) => {
      const review = reviews[index];
      if (review === undefined || !row.dependsOn.some((key) => item.gates.includes(key))) return [];
      // A step the review itself reads (the word timing the narration review hears) must not
      // wait for it.
      return upstream(review, byKey).has(row.key) ? [] : [review.key];
    });
    return waits.length === 0 ? row : { ...row, dependsOn: [...row.dependsOn, ...waits] };
  });
  return [...gated, ...reviews];
}

function reviewedItems(
  stage: ReviewStage,
  recipes: readonly ResolvedWorkRecipe[],
  byKey: ReadonlyMap<string, ResolvedWorkRecipe>,
): readonly ReviewedItem[] {
  const one = (itemKey: string, inputs: readonly ResolvedWorkRecipe[], gates: readonly string[]) =>
    ({ stage, itemKey, inputs, gates }) satisfies ReviewedItem;
  switch (stage) {
    case "article": {
      const article = byKey.get("article:body");
      return article === undefined || article.kind !== "provider"
        ? []
        : [one(article.key, [article], [article.key])];
    }
    case "images": {
      const reference = byKey.get("reference:image");
      return recipes
        .filter((row) => row.key.startsWith("image:") && row.input.kind === "image")
        .map((row) => one(row.key, reference === undefined ? [row] : [row, reference], [row.key]));
    }
    // One thumbnail, or each of three when the project makes three to compare.
    case "thumbnail":
      return recipes
        .filter((row) => /^thumbnail:image(?::\d+)?$/.test(row.key) && row.kind === "provider")
        .map((row) => one(row.key, [row], [row.key]));
    case "narration": {
      const timing = byKey.get("subtitles:timing");
      if (timing === undefined) return [];
      const article = byKey.get("article:body");
      return [
        one(narrationItemKey, article === undefined ? [timing] : [timing, article], [
          timing.key,
          ...timing.dependsOn,
        ]),
      ];
    }
    case "shorts":
      return recipes.flatMap((row) => {
        const match = /^(shorts:\d+):render$/.exec(row.key);
        return match?.[1] === undefined ? [] : [one(match[1], [row], [row.key])];
      });
  }
}

// The Images stage runs the image reviews and the Video stage the shorts'; the others run in
// the stage that made the item.
function stageOf(stage: ReviewStage): ResolvedWorkRecipe["stage"] {
  switch (stage) {
    case "article":
      return "article";
    case "images":
      return "images";
    case "narration":
      return "audio";
    case "thumbnail":
      return "thumbnail";
    case "shorts":
      return "video";
  }
}

function upstream(
  review: ResolvedWorkRecipe,
  byKey: ReadonlyMap<string, ResolvedWorkRecipe>,
): ReadonlySet<string> {
  const seen = new Set<string>();
  const queue = [...review.dependsOn];
  for (let key = queue.pop(); key !== undefined; key = queue.pop()) {
    if (seen.has(key)) continue;
    seen.add(key);
    queue.push(...(byKey.get(key)?.dependsOn ?? []));
  }
  return seen;
}
