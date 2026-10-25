import type { PromptKind } from "@app/slices/library/model.js";
import { starterPacks, starterSet } from "@app/slices/onboarding/packs.js";
import { defaultReviewPrompts, type ReviewStage } from "@app/slices/reviews/model.js";
import { defaultShortsPrompt } from "@app/slices/shorts/model.js";
import { defaultPostPrompt } from "@app/slices/social/post-prompt.js";
import { defaultDescriptionPrompt } from "@app/slices/youtube/model.js";
import { narrationStarter } from "@/lib/narration-starter";

// A text a new prompt can start from.
export interface PromptExample {
  readonly key: string;
  readonly name: string;
  readonly body: string;
}

// The texts every install has for a kind, whether or not its starter templates were added: the
// wording Slopify uses when a project picks no prompt of the kind, and the starter templates'
// own prompts of it. A first prompt never starts from a blank box with nothing to copy.
export function builtInExamples(kind: PromptKind): readonly PromptExample[] {
  const own = ownWording(kind);
  const packed = [...starterPacks, starterSet].flatMap((pack) =>
    pack.prompts
      .filter((prompt) => prompt.kind === kind)
      .map((prompt) => ({
        key: `pack:${pack.id}:${prompt.key}`,
        name: `${prompt.name} (built in)`,
        body: prompt.body,
      })),
  );
  return [...own, ...packed];
}

// What a saved prompt's example list shows besides the built-ins: the built-ins whose text no
// saved prompt already holds (an added starter template's prompt is listed once, as yours).
export function examplesWith(
  kind: PromptKind,
  saved: readonly PromptExample[],
): readonly PromptExample[] {
  const taken = new Set(saved.map((one) => one.body));
  return [...builtInExamples(kind).filter((one) => !taken.has(one.body)), ...saved];
}

const reviewNames: Readonly<Record<ReviewStage, string>> = {
  article: "Article check",
  images: "Image check",
  narration: "Narration check",
  thumbnail: "Thumbnail check",
  shorts: "Shorts check",
  promise: "Opening keeps the title's promise",
};

// A script for two or more voices: what to write, in the words a person would use. The format
// of the turns is Slopify's to add, as it is for every script prompt.
const conversationExample = [
  "Write a lively conversation between the speakers about {{Topic}}, about 1,500 words.",
  "",
  "- The first speaker leads and asks the questions a curious listener would; the second answers with stories and examples.",
  "- Short turns that sound spoken, with the speakers reacting to each other.",
  "- Open on a question that makes the listener want the answer; end on the one thing worth remembering.",
  "- Stay accurate. Where something is uncertain or disputed, the speakers say so.",
].join("\n");

function ownWording(kind: PromptKind): readonly PromptExample[] {
  switch (kind) {
    case "narration":
      return [{ key: "own", name: "Documentary delivery (built in)", body: narrationStarter }];
    case "description":
      return [{ key: "own", name: "Built-in wording", body: defaultDescriptionPrompt }];
    case "shorts":
      return [{ key: "own", name: "Built-in wording", body: defaultShortsPrompt }];
    case "post":
      return [{ key: "own", name: "Built-in wording", body: defaultPostPrompt }];
    case "review":
      return (Object.keys(reviewNames) as ReviewStage[]).map((stage) => ({
        key: `review:${stage}`,
        name: `${reviewNames[stage]} (built in)`,
        body: defaultReviewPrompts[stage],
      }));
    case "script":
      return [{ key: "own", name: "Two-voice conversation (built in)", body: conversationExample }];
    case "article":
    case "image":
    case "thumbnail":
      return [];
  }
}
