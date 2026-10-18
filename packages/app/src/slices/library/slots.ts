// What a run needs from the library at the moment Play is pressed: the saved bodies of
// the picked templates, the slot names they ask for, and the rendered text stored on the
// project. The bodies are read at the click, not at selection, so an edit made in between
// is the one that runs.

import type { DatabaseSync } from "node:sqlite";
import type { EntryChoice, RunDraft } from "../admission/model.js";
import {
  type FieldError,
  normaliseDraft,
  usesNarrationPreparation,
  usesReference,
  usesShorts,
  usesYoutubeDescription,
} from "../admission/rules.js";
import { collectFields, render } from "../admission/substitute.js";
import {
  type KeywordUses,
  keywordUsesOf,
  type PlacedBody,
  placedProblems,
  textEntryProblems,
} from "../keywords/rules.js";
import { reviewPromptKey } from "../reviews/model.js";
import { activeReviewStages } from "../reviews/rules.js";
import { usesScriptPrompt } from "../voices/model.js";
import type { Entry, EntryCategory, PromptKind } from "./model.js";
import { type LibrarySnapshot, snapshotEntry, snapshotPrompt } from "./snapshot.js";

export interface PickedBody {
  // The key this body's rendered text takes in `projects.config.rendered`, named after
  // the draft field that picked it: `article`, `imagePrompts.0`, `thumbnailPrompt`,
  // `intro`, `outro`.
  readonly key: string;
  readonly body: string;
}

export interface PickedTemplates {
  // The draft with each picked entry's mode replaced by the saved entry's. The request
  // says which entry, the library says what it is.
  readonly draft: RunDraft;
  // Distinct slot names in first-appearance order: the article body, then the image
  // prompts in selection order, then the thumbnail prompt.
  readonly requiredSlots: readonly string[];
  readonly bodies: readonly PickedBody[];
  // What is wrong with the picked templates themselves: one the draft names that the library no
  // longer holds, or one using a keyword Slopify fills where it can't be filled.
  readonly missing: readonly FieldError[];
  // The costly keywords Slopify fills that the picked bodies use, for admission.
  readonly keywordUses: KeywordUses;
}

export function pickTemplates(
  db: DatabaseSync,
  input: RunDraft,
  snapshot?: LibrarySnapshot,
): PickedTemplates {
  const draft = normaliseDraft(input);
  const { sources } = draft;
  const missing: FieldError[] = [];
  // Only the prompts of stages set to Generate, plus the picked
  // entries. A prompt left selected on a stage set to Provide asks for no field.
  const text: PickedBody[] = [];
  const image: PickedBody[] = [];
  // Each picked body with the field that picked it and where it runs, for the keyword checks.
  const placed: PlacedBody[] = [];
  const body = (
    kind: PromptKind,
    name: string | undefined,
    field: string,
    into: PickedBody[],
    key: string,
  ): void => {
    const at = into.length;
    pickBody(db, kind, name, field, missing, into, key, snapshot);
    const picked = into[at];
    if (picked !== undefined) placed.push({ field, place: kind, body: picked.body });
  };

  if (sources.article === "generate") {
    body(
      usesScriptPrompt(draft) ? "script" : "article",
      draft.articlePrompt,
      "articlePrompt",
      text,
      "article",
    );
  }

  const intro = pickEntry(db, "intro", draft.intro, missing, snapshot);
  if (usesNarrationPreparation(draft))
    body("narration", draft.narrationPrompt, "narrationPrompt", text, "narration");
  const outro = pickEntry(db, "outro", draft.outro, missing, snapshot);
  push(text, "intro", intro);
  push(text, "outro", outro);
  if (intro !== undefined) placed.push({ field: "intro", place: "intro", body: intro.body });
  if (outro !== undefined) placed.push({ field: "outro", place: "outro", body: outro.body });
  for (const entry of [intro, outro])
    if (entry?.mode === "text") missing.push(...textEntryProblems(entry.body, entry.category));
  // None picked is the built-in prompt, which asks for no keyword.
  if (usesYoutubeDescription(draft))
    body("description", draft.descriptionPrompt, "descriptionPrompt", text, "description");

  // The Shorts step's two prompts; none picked is the built-in one, which asks for no keyword.
  if (usesShorts(draft)) {
    body("shorts", draft.shorts?.prompt, "shorts.prompt", text, "shorts");
    body("image", draft.shorts?.imagePrompt, "shorts.imagePrompt", image, "shortsImage");
  }

  // Each reviewed stage's Review prompt; none picked is the stage's built-in one.
  for (const stage of activeReviewStages(draft))
    body(
      "review",
      draft.reviews?.stages[stage]?.prompt,
      `reviews.stages.${stage}.prompt`,
      text,
      reviewPromptKey(stage),
    );

  // The establishing image's prompt: an image prompt like the others, its keywords filled the
  // same way.
  if (usesReference(draft) && draft.reference?.source === "prompt")
    body("image", draft.reference.prompt, "reference.prompt", image, "referencePrompt");

  if (sources.images === "generate") {
    for (const [index, picked] of draft.imagePrompts.entries()) {
      const field = `imagePrompts.${String(index)}.name`;
      body("image", picked.name, field, image, `imagePrompts.${String(index)}`);
    }
  }

  // Both Generate modes read the same thumbnail template; Prompt by LLM sends it as the
  // instruction rather than to the image provider.
  if (sources.thumbnail === "from_prompt" || sources.thumbnail === "prompt_by_llm") {
    body("thumbnail", draft.thumbnailPrompt, "thumbnailPrompt", image, "thumbnailPrompt");
  }

  const fields = collectFields(
    // The title's keywords are asked for like a prompt's: it is filled when the run starts.
    [draft.title, ...text.map((picked) => picked.body)],
    image.map((picked) => picked.body),
  );
  return {
    draft: withSavedModes(draft, intro, outro),
    requiredSlots: fields.map((field) => field.name),
    bodies: [...text, ...image],
    missing: [...missing, ...placedProblems(placed, draft.values)],
    keywordUses: keywordUsesOf(placed),
  };
}

// Every picked body rendered once, with the trimmed values
// admission has already accepted, and stored on the project.
export function renderPicked(
  picked: PickedTemplates,
  values: Readonly<Record<string, string>>,
): Record<string, string> {
  const rendered: Record<string, string> = {};
  for (const { key, body: text } of picked.bodies) {
    rendered[key] = render(text, values);
  }
  return rendered;
}

function pickBody(
  db: DatabaseSync,
  kind: PromptKind,
  name: string | undefined,
  field: string,
  missing: FieldError[],
  into: PickedBody[],
  key: string,
  snapshot?: LibrarySnapshot,
): void {
  // An unpicked prompt is admission's rule to state ("Pick an article prompt."), so this
  // says nothing about it and the form marks the field once.
  if (name === undefined || name.trim() === "") {
    return;
  }
  const prompt = snapshotPrompt(db, snapshot, kind, name);
  if (prompt === undefined) {
    missing.push({ field, message: `That ${kind} prompt was deleted. Choose another.` });
    return;
  }
  into.push({ key, body: prompt.body });
}

function pickEntry(
  db: DatabaseSync,
  category: EntryCategory,
  choice: EntryChoice | undefined,
  missing: FieldError[],
  snapshot?: LibrarySnapshot,
): Entry | undefined {
  if (choice === undefined) {
    return undefined;
  }
  const entry = snapshotEntry(db, snapshot, category, choice.name);
  if (entry === undefined) {
    missing.push({
      field: category,
      message: `That ${category} entry was deleted. Choose another.`,
    });
  }
  return entry;
}

function push(into: PickedBody[], key: string, entry: Entry | undefined): void {
  if (entry !== undefined) {
    into.push({ key, body: entry.body });
  }
}

function withSavedModes(
  draft: RunDraft,
  intro: Entry | undefined,
  outro: Entry | undefined,
): RunDraft {
  return {
    ...draft,
    ...(intro === undefined ? {} : { intro: { name: intro.name, mode: intro.mode } }),
    ...(outro === undefined ? {} : { outro: { name: outro.name, mode: outro.mode } }),
  };
}
