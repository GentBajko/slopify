import type { RunDraft } from "@app/slices/admission/model.js";
import type { AdmissionResult, FieldError } from "@app/slices/admission/rules.js";
import {
  admit,
  imagesPerRunMax,
  numberPerPromptMax,
  titleMax,
} from "@app/slices/admission/rules.js";
import type { Field } from "@app/slices/admission/substitute.js";
import { collectFields } from "@app/slices/admission/substitute.js";
import type { Entry, Prompt } from "@app/slices/library/model.js";
import type { DraftInput, PlayFormState, Upload } from "@/play/state";
import { draftOf, stagedOf } from "@/play/state";

// Live admission. `admit` is the server's own function, imported through `@app/*`: the
// sentence the form shows and the refusal the server writes are one rule, and the only
// thing this file adds is the order the screen reads its controls in.

export interface Blocker {
  // The dotted path of the control, the same name `admit` and the 400's `fields[]` use,
  // so the field is marked in place (`logic/04` §Q29).
  readonly field: string;
  // Hints name the next action, never the rule (uiux/screens/06-play.md).
  readonly hint: string;
}

export interface Admission {
  // The keyword fields the picked prompts and entries ask for, grouped (`logic/03` step 3).
  readonly fields: readonly Field[];
  readonly draft: RunDraft;
  readonly result: AdmissionResult;
  readonly blocker: Blocker | undefined;
}

export interface AdmissionInput {
  readonly form: PlayFormState;
  readonly prompts: readonly Prompt[];
  readonly entries: readonly Entry[];
  readonly silenceGapSeconds: number;
}

// `slices/library/slots.ts` collects the same bodies at the click: the article prompt of
// a generating article stage, the picked intro and outro whatever the sources say
// (`logic/03` §Q98), the ticked image prompts of a generating images stage, and the
// thumbnail prompt of either Generate mode.
export function keywordFields(input: AdmissionInput): readonly Field[] {
  const { form } = input;
  const text: string[] = [];
  const image: string[] = [];

  if (form.sources.article === "generate") {
    push(text, bodyOf(input.prompts, "article", form.articlePrompt));
  }
  push(text, entryBody(input.entries, "intro", form.intro));
  push(text, entryBody(input.entries, "outro", form.outro));

  if (form.sources.images === "generate") {
    for (const picked of form.imagePrompts) {
      push(image, bodyOf(input.prompts, "image", picked.name));
    }
  }
  if (form.sources.thumbnail === "from_prompt" || form.sources.thumbnail === "prompt_by_llm") {
    push(image, bodyOf(input.prompts, "thumbnail", form.thumbnailPrompt));
  }

  return collectFields(text, image);
}

export function admission(input: AdmissionInput): Admission {
  const fields = keywordFields(input);
  const draftInput: DraftInput = {
    form: input.form,
    entries: input.entries,
    slots: fields.map((field) => field.name),
    silenceGapSeconds: input.silenceGapSeconds,
  };
  const draft = draftOf(draftInput);
  const result = admit({
    draft,
    staged: stagedOf(input.form.provided),
    requiredSlots: draftInput.slots,
  });
  return { fields, draft, result, blocker: firstBlocker(input.form, result) };
}

// The rails top to bottom, then the cue sheet: the order the screen is read in, which is
// the order the hint names things in (uiux/03-experience.md, tab order). `admit` answers
// in its own order, so the ranking is done here rather than by reading its list.
const readingOrder: readonly string[] = [
  "sources",
  "provided.research",
  "articlePrompt",
  "provided.article",
  "audio",
  "provided.audio",
  "imagePrompts",
  "images",
  "provided.images",
  "thumbnailPrompt",
  "provided.thumbnail",
  "title",
  "intro",
  "outro",
  "llm",
  "values",
  "silenceGapSeconds",
];

export function firstBlocker(form: PlayFormState, result: AdmissionResult): Blocker | undefined {
  // An upload the rule cannot see yet: it has no staged row, so `admit` would call it
  // missing rather than say it is still copying (`logic/05` §Q44).
  const waiting = uploadBlocker(form);
  if (waiting !== undefined) {
    return waiting;
  }
  if (result.ok) {
    return undefined;
  }
  const ranked = [...result.fields].sort((left, right) => rank(left.field) - rank(right.field));
  const first = ranked[0];
  return first === undefined ? undefined : { field: first.field, hint: hintOf(form, first) };
}

function uploadBlocker(form: PlayFormState): Blocker | undefined {
  const { sources, provided } = form;
  const picked: Upload[] = [];
  if (sources.audio === "provide" && provided.audio !== undefined) {
    picked.push(provided.audio);
  }
  if (sources.images === "provide") {
    picked.push(...provided.images);
  }
  if (sources.thumbnail === "provide" && provided.thumbnail !== undefined) {
    picked.push(provided.thumbnail);
  }
  if (picked.some((upload) => upload.error !== undefined)) {
    return { field: "provided", hint: "Remove the upload that failed to play" };
  }
  if (picked.some((upload) => upload.file === undefined)) {
    return { field: "provided", hint: "Wait for the uploads to finish to play" };
  }
  return undefined;
}

function rank(field: string): number {
  let best = readingOrder.length;
  for (const [at, prefix] of readingOrder.entries()) {
    if ((field === prefix || field.startsWith(`${prefix}.`)) && at < best) {
      best = at;
    }
  }
  return best;
}

// The next action, in the form's own words. Where a field can fail two ways the form
// decides which sentence it is, rather than reading the rule's message back.
function hintOf(form: PlayFormState, error: FieldError): string {
  if (error.field.startsWith("values.")) {
    return `Fill ${error.field.slice("values.".length)} to play`;
  }
  if (error.field.startsWith("imagePrompts.")) {
    return error.field.endsWith(".number")
      ? `Set a Number between 1 and ${String(numberPerPromptMax)} to play`
      : "Pick an image prompt to play";
  }
  switch (error.field) {
    case "title":
      return form.title.trim() === ""
        ? "Name the video to play"
        : `Shorten the title to ${String(titleMax)} characters to play`;
    case "imagePrompts":
      return form.imagePrompts.length === 0
        ? "Tick an image prompt to play"
        : `Lower the Numbers to play: a run makes at most ${String(imagesPerRunMax)} images`;
    case "llm":
      return "Pick an LLM provider and model to play";
    case "articlePrompt":
      return "Pick an article prompt to play";
    case "audio":
      return "Pick a narration provider to play";
    case "audio.voice":
      return "Pick a voice to play";
    case "images":
      return "Pick an image provider and model to play";
    case "thumbnailPrompt":
      return "Pick a thumbnail prompt to play";
    case "provided.research":
      return "Paste the research notes to play";
    case "provided.article":
      return "Paste the article to play";
    case "provided.audio":
      return "Attach the narration audio to play";
    case "provided.images":
      return form.provided.images.length > imagesPerRunMax
        ? `Remove images to play: a run holds at most ${String(imagesPerRunMax)}`
        : "Attach at least one image to play";
    case "provided.thumbnail":
      return "Attach the thumbnail image to play";
    default:
      // A rule the form has no shorter sentence for says its own, verbatim: nothing is
      // invented and nothing is swallowed.
      return error.message;
  }
}

function bodyOf(
  prompts: readonly Prompt[],
  kind: "article" | "image" | "thumbnail",
  name: string,
): string | undefined {
  if (name === "") {
    return undefined;
  }
  return prompts.find((prompt) => prompt.kind === kind && prompt.name === name)?.body;
}

function entryBody(
  entries: readonly Entry[],
  category: "intro" | "outro",
  name: string,
): string | undefined {
  if (name === "") {
    return undefined;
  }
  return entries.find((entry) => entry.category === category && entry.name === name)?.body;
}

function push(into: string[], body: string | undefined): void {
  if (body !== undefined) {
    into.push(body);
  }
}
