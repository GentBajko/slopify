import type { EntryChoice, RunDraft } from "@app/slices/admission/model.js";
import {
  normaliseDraft,
  usesNarrationPreparation,
  usesReference,
  usesShorts,
  usesYoutubeDescription,
} from "@app/slices/admission/rules.js";
import { type PlacedBody, textEntryProblems } from "@app/slices/keywords/rules.js";
import type { Entry, EntryCategory, Prompt, PromptKind } from "@app/slices/library/model.js";
import { activeReviewStages } from "@app/slices/reviews/rules.js";
import { usesScriptPrompt } from "@app/slices/voices/model.js";

// Every body the run picks, with the field that picked it and where it runs: the same list, in
// the same order, as `pickTemplates` (`slices/library/slots.ts`) builds at the click, read from
// the library the page holds. Play checks the keywords Slopify fills against it, so the form
// refuses exactly what the server refuses.
export function placedBodies(
  input: RunDraft,
  prompts: readonly Prompt[],
  entries: readonly Entry[],
): readonly PlacedBody[] {
  const draft = normaliseDraft(input);
  const { sources } = draft;
  const placed: PlacedBody[] = [];
  const body = (kind: PromptKind, name: string | undefined, field: string): void => {
    if (name === undefined || name.trim() === "") return;
    const found = prompts.find((prompt) => prompt.kind === kind && prompt.name === name);
    if (found !== undefined) placed.push({ field, place: kind, body: found.body });
  };
  const entry = (category: EntryCategory, choice: EntryChoice | undefined): void => {
    const found =
      choice === undefined
        ? undefined
        : entries.find((one) => one.category === category && one.name === choice.name);
    if (found !== undefined) placed.push({ field: category, place: category, body: found.body });
  };

  if (sources.article === "generate")
    body(usesScriptPrompt(draft) ? "script" : "article", draft.articlePrompt, "articlePrompt");
  if (usesNarrationPreparation(draft)) body("narration", draft.narrationPrompt, "narrationPrompt");
  entry("intro", draft.intro);
  entry("outro", draft.outro);
  if (usesYoutubeDescription(draft))
    body("description", draft.descriptionPrompt, "descriptionPrompt");
  if (usesShorts(draft)) {
    body("shorts", draft.shorts?.prompt, "shorts.prompt");
    body("image", draft.shorts?.imagePrompt, "shorts.imagePrompt");
  }
  for (const stage of activeReviewStages(draft))
    body("review", draft.reviews?.stages[stage]?.prompt, `reviews.stages.${stage}.prompt`);
  if (usesReference(draft) && draft.reference?.source === "prompt")
    body("image", draft.reference.prompt, "reference.prompt");
  if (sources.images === "generate")
    for (const [index, picked] of draft.imagePrompts.entries())
      body("image", picked.name, `imagePrompts.${String(index)}.name`);
  if (sources.thumbnail === "from_prompt" || sources.thumbnail === "prompt_by_llm")
    body("thumbnail", draft.thumbnailPrompt, "thumbnailPrompt");
  return placed;
}

// A picked Text intro or outro is narrated as written, so a keyword only an AI step fills is
// refused there, judged by the saved entry's mode as `pickTemplates` does.
export function textEntryRefusals(
  draft: RunDraft,
  entries: readonly Entry[],
): readonly { readonly field: string; readonly message: string }[] {
  return (["intro", "outro"] as const).flatMap((category) => {
    const choice = draft[category];
    const found =
      choice === undefined
        ? undefined
        : entries.find((one) => one.category === category && one.name === choice.name);
    return found?.mode === "text" ? textEntryProblems(found.body, category) : [];
  });
}
