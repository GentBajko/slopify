// What a run needs from the library at the moment Play is pressed: the saved bodies of
// the picked templates, the slot names they ask for, and the rendered text stored on the
// project. `logic/04` §Q34 fixes the timing - the bodies are read at the click, not at
// selection, so an edit made in between is the one that runs.

import type { DatabaseSync } from "node:sqlite";
import type { EntryChoice, RunDraft } from "../admission/model.js";
import type { FieldError } from "../admission/rules.js";
import { collectFields, render } from "../admission/substitute.js";
import type { Entry, EntryCategory, PromptKind } from "./model.js";
import { entryByName, promptByName } from "./repo.js";

export interface PickedBody {
  // The key this body's rendered text takes in `projects.config.rendered`, named after
  // the draft field that picked it: `article`, `imagePrompts.0`, `thumbnailPrompt`,
  // `intro`, `outro`.
  readonly key: string;
  readonly body: string;
}

export interface PickedTemplates {
  // The draft with each picked entry's mode replaced by the saved entry's. The request
  // says which entry, the library says what it is (`logic/04` §Q97).
  readonly draft: RunDraft;
  // Distinct slot names in the order `logic/03` §Q24 fixes: the article body, then the
  // image prompts in selection order, then the thumbnail prompt.
  readonly requiredSlots: readonly string[];
  readonly bodies: readonly PickedBody[];
  // A template the draft names that the library no longer holds (`logic/15` step 4).
  readonly missing: readonly FieldError[];
}

export function pickTemplates(db: DatabaseSync, draft: RunDraft): PickedTemplates {
  const { sources } = draft;
  const missing: FieldError[] = [];
  // `logic/03` step 3: only the prompts of stages set to Generate, plus the picked
  // entries. A prompt left selected on a stage set to Provide asks for no field.
  const text: PickedBody[] = [];
  const image: PickedBody[] = [];

  if (sources.article === "generate") {
    body(db, "article", draft.articlePrompt, "articlePrompt", missing, text, "article");
  }

  const intro = pickEntry(db, "intro", draft.intro, missing);
  const outro = pickEntry(db, "outro", draft.outro, missing);
  push(text, "intro", intro);
  push(text, "outro", outro);

  if (sources.images === "generate") {
    for (const [index, picked] of draft.imagePrompts.entries()) {
      const field = `imagePrompts.${String(index)}.name`;
      body(db, "image", picked.name, field, missing, image, `imagePrompts.${String(index)}`);
    }
  }

  // Both Generate modes read the same thumbnail template; Prompt by LLM sends it as the
  // instruction rather than to the image provider (`logic/10` step 1).
  if (sources.thumbnail === "from_prompt" || sources.thumbnail === "prompt_by_llm") {
    body(
      db,
      "thumbnail",
      draft.thumbnailPrompt,
      "thumbnailPrompt",
      missing,
      image,
      "thumbnailPrompt",
    );
  }

  const fields = collectFields(
    text.map((picked) => picked.body),
    image.map((picked) => picked.body),
  );
  return {
    draft: withSavedModes(draft, intro, outro),
    requiredSlots: fields.map((field) => field.name),
    bodies: [...text, ...image],
    missing,
  };
}

// `logic/03` step 5 and step 6: every picked body rendered once, with the trimmed values
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

function body(
  db: DatabaseSync,
  kind: PromptKind,
  name: string | undefined,
  field: string,
  missing: FieldError[],
  into: PickedBody[],
  key: string,
): void {
  // An unpicked prompt is admission's rule to state ("Pick an article prompt."), so this
  // says nothing about it and the form marks the field once.
  if (name === undefined || name.trim() === "") {
    return;
  }
  const prompt = promptByName(db, kind, name);
  if (prompt === undefined) {
    missing.push({ field, message: `That ${kind} prompt no longer exists; pick another.` });
    return;
  }
  into.push({ key, body: prompt.body });
}

function pickEntry(
  db: DatabaseSync,
  category: EntryCategory,
  choice: EntryChoice | undefined,
  missing: FieldError[],
): Entry | undefined {
  if (choice === undefined) {
    return undefined;
  }
  const entry = entryByName(db, category, choice.name);
  if (entry === undefined) {
    missing.push({
      field: category,
      message: `That ${category} entry no longer exists; pick another.`,
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
