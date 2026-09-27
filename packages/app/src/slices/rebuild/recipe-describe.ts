import type { FingerprintValue } from "../../kernel/runner/work.js";
import { usesDescribedNarration } from "../admission/rules.js";
import { describedBlocks, narrationBlocks, spokenNarration } from "../narration/blocks.js";
import { describeMessages, spokenPassage } from "../narration/describe.js";
import { type RecipeContext, type ResolvedWorkRecipe, recipe } from "./recipe-model.js";
import { llmInput, matchingText, renderedPrompt } from "./recipe-text.js";

// "Describe tables and figures in the narration": one text-model step per table, figure,
// diagram, equation or code block (`narration:describe:<n>`, in reading order), whose answer
// is said in the block's place. The narration is chunked, prepared and spoken from that
// spoken text, so the captions and the word timing follow what is said; the article, the
// PDF and the reading view keep the block itself.
//
// Off (or absent) plans nothing here and the narration is the flattened article, so a project
// saved before the setting keeps every fingerprint.

export const describeFutureKey = "narration:describe:future";

export function describing(context: RecipeContext): boolean {
  return usesDescribedNarration(context.config);
}

// What a description request is made of before its block is known: the instruction family,
// the model and the style guidance. The future step's template, so a change to any of them
// reaches the narration still to be written.
export function describeTemplate(context: RecipeContext): FingerprintValue {
  const input = llmInput(
    context,
    describeMessages(
      { kind: "table", index: 1, source: "", section: null },
      renderedPrompt(context, "narration"),
      context.config.language,
    ),
  );
  return [
    "narration-description-v1",
    JSON.parse(JSON.stringify({ ...input, thinkingConfig: null })) as FingerprintValue,
    context.config.audio?.skipCode === true,
  ];
}

// The step that stands in for the descriptions while the text they describe is unwritten.
export function describeFuture(
  context: RecipeContext,
  dependency: Pick<ResolvedWorkRecipe, "key" | "fingerprint">,
): ResolvedWorkRecipe {
  return recipe(
    context,
    describeFutureKey,
    "audio",
    {
      kind: "deferred",
      version: 1,
      operation: "narration-description",
      template: [dependency.fingerprint, describeTemplate(context)],
    },
    [dependency.key],
  );
}

export interface DescribedText {
  readonly recipes: readonly ResolvedWorkRecipe[];
  // The text as it is spoken, or null while a description has not answered.
  readonly spoken: string | null;
}

// The Markdown's described blocks as steps, numbered from `offset + 1`, and the spoken text
// once every one of them has answered.
export function describedText(
  context: RecipeContext,
  markdown: string,
  dependsOn: readonly string[],
  offset = 0,
): DescribedText {
  const { config } = context;
  const blocks = narrationBlocks(markdown, {
    code: config.audio?.skipCode === true ? "skip" : "describe",
    language: config.language,
  });
  const style = renderedPrompt(context, "narration");
  const passages = new Map<number, string | null>();
  const recipes = describedBlocks(blocks).map((block) => {
    const index = offset + block.index;
    const value = recipe(
      context,
      `narration:describe:${String(index)}`,
      "audio",
      {
        ...llmInput(context, describeMessages(block, style, config.language)),
        describe: {
          kind: block.kind,
          index,
          ...(block.image === undefined ? {} : { image: block.image }),
        },
      },
      dependsOn,
    );
    const answer = matchingText(context, value, "text");
    passages.set(block.index, answer === null ? null : spokenPassage(answer));
    return value;
  });
  return {
    recipes,
    spoken: spokenNarration(blocks, (block) => passages.get(block.index) ?? null),
  };
}
