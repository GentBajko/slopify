import type { StageKind } from "../../kernel/pipeline.js";
import { stageKinds } from "../../kernel/pipeline.js";
import type { StagedFile } from "../storage/model.js";
import type { ProviderChoice, RunDraft, StageSource } from "./model.js";

export interface FieldError {
  // Dotted path of the control on Play, so the form marks it in place (logic/04 §Q29).
  readonly field: string;
  readonly message: string;
}

export type AdmissionResult =
  | { readonly ok: true; readonly draft: RunDraft }
  | { readonly ok: false; readonly fields: readonly FieldError[] };

export interface AdmissionInput {
  readonly draft: RunDraft;
  readonly staged: readonly StagedFile[];
  // The distinct slot names the selected prompt bodies and picked entries ask for
  // (logic/03 step 3). The caller collects them; the rule only checks the values.
  readonly requiredSlots: readonly string[];
}

export const titleMax = 200;
export const valueMax = 200;
export const numberPerPromptMax = 20;
export const imagesPerRunMax = 60;
// ceiling: logic/11 §Q99 and logic/02 fix the default at 3 s but name no bounds, so the
// range is this module's. A wider gap is a settings change, not a schema change.
export const silenceGapSecondsMax = 30;

// mockup §Q28, logic/04 §Q31, logic/10 §Q78. Video is always generated (logic/01 step 5).
const allowedSources: Readonly<Record<StageKind, readonly StageSource[]>> = {
  research: ["generate", "provide", "off"],
  article: ["generate", "provide"],
  audio: ["generate", "provide"],
  images: ["generate", "provide"],
  thumbnail: ["off", "from_prompt", "prompt_by_llm", "provide"],
  video: ["generate"],
};

export function admit(input: AdmissionInput): AdmissionResult {
  const fields: FieldError[] = [];
  const draft = normalise(input.draft);
  const { sources } = draft;

  if (draft.title === "") {
    fields.push({ field: "title", message: "A title is required." });
  } else if (draft.title.length > titleMax) {
    fields.push({ field: "title", message: `A title is at most ${titleMax} characters.` });
  }

  for (const kind of stageKinds) {
    if (!allowedSources[kind].includes(sources[kind])) {
      fields.push({
        field: `sources.${kind}`,
        message: `The ${kind} stage cannot be set to ${sources[kind]}.`,
      });
    }
  }

  // logic/04 §Q28 with logic/10 §Q81 and §Q97: the LLM row is required only when
  // something in the run actually asks an LLM for text.
  const needsLlm =
    sources.research === "generate" ||
    sources.article === "generate" ||
    sources.thumbnail === "prompt_by_llm" ||
    draft.intro?.mode === "llm" ||
    draft.outro?.mode === "llm";
  if (needsLlm && !chosen(draft.llm)) {
    fields.push({ field: "llm", message: "Pick an LLM provider and model." });
  }

  if (sources.article === "generate" && blank(draft.articlePrompt)) {
    fields.push({ field: "articlePrompt", message: "Pick an article prompt." });
  }

  const voiced = draft.audio;
  if (sources.audio === "generate") {
    if (voiced === undefined || !chosen(voiced)) {
      fields.push({ field: "audio", message: "Pick a narration provider and model." });
    } else if (voiced.voice.trim() === "") {
      fields.push({ field: "audio.voice", message: "Pick a voice." });
    }
  }

  if (sources.images === "generate") {
    checkImagePrompts(draft, fields);
    if (!chosen(draft.images)) {
      fields.push({ field: "images", message: "Pick an image provider and model." });
    }
  }

  if (
    (sources.thumbnail === "from_prompt" || sources.thumbnail === "prompt_by_llm") &&
    blank(draft.thumbnailPrompt)
  ) {
    fields.push({ field: "thumbnailPrompt", message: "Pick a thumbnail prompt." });
  }

  checkProvided(draft, input.staged, fields);
  checkValues(draft, input.requiredSlots, fields);

  if (
    !Number.isFinite(draft.silenceGapSeconds) ||
    draft.silenceGapSeconds < 0 ||
    draft.silenceGapSeconds > silenceGapSecondsMax
  ) {
    fields.push({
      field: "silenceGapSeconds",
      message: `The silence gap is between 0 and ${silenceGapSecondsMax} seconds.`,
    });
  }

  return fields.length === 0 ? { ok: true, draft } : { ok: false, fields };
}

// logic/05 §Q41: research only feeds article writing, so a provided article hides it.
// logic/01 step 5: video is generated whatever the form said.
function normalise(draft: RunDraft): RunDraft {
  const sources = { ...draft.sources, video: "generate" as StageSource };
  if (sources.article === "provide") {
    sources.research = "off";
  }
  // Prototype-free, because a slot name is user-authored: `{{constructor}}` would
  // otherwise answer with Object rather than undefined and pass the "required" check, and
  // a value posted under `__proto__` would run a setter instead of being stored.
  const values = Object.create(null) as Record<string, string>;
  for (const [name, value] of Object.entries(draft.values)) {
    values[name] = value.trim();
  }
  return { ...draft, title: draft.title.trim(), sources, values };
}

function checkImagePrompts(draft: RunDraft, fields: FieldError[]): void {
  if (draft.imagePrompts.length === 0) {
    // logic/04 §Q31: a run always has an image source.
    fields.push({ field: "imagePrompts", message: "Tick at least one image prompt." });
    return;
  }
  let total = 0;
  for (const [index, prompt] of draft.imagePrompts.entries()) {
    total += prompt.number;
    if (blank(prompt.name)) {
      fields.push({ field: `imagePrompts.${index}.name`, message: "Pick an image prompt." });
    }
    if (
      !Number.isInteger(prompt.number) ||
      prompt.number < 1 ||
      prompt.number > numberPerPromptMax
    ) {
      fields.push({
        field: `imagePrompts.${index}.number`,
        message: `Number is between 1 and ${numberPerPromptMax}.`,
      });
    }
  }
  if (total > imagesPerRunMax) {
    fields.push({
      field: "imagePrompts",
      message: `A run makes at most ${imagesPerRunMax} images; this one asks for ${total}.`,
    });
  }
}

function checkProvided(draft: RunDraft, staged: readonly StagedFile[], fields: FieldError[]): void {
  const { sources, provided } = draft;
  if (sources.research === "provide" && blank(provided.research)) {
    fields.push({ field: "provided.research", message: "Paste the research notes." });
  }
  if (sources.article === "provide" && blank(provided.article)) {
    fields.push({ field: "provided.article", message: "Paste the article." });
  }
  if (sources.audio === "provide") {
    checkFile(staged, provided.audio, "audio", "provided.audio", "Pick an audio file.", fields);
  }
  if (sources.thumbnail === "provide") {
    checkFile(
      staged,
      provided.thumbnail,
      "thumbnail",
      "provided.thumbnail",
      "Pick a thumbnail image.",
      fields,
    );
  }
  if (sources.images === "provide") {
    const ids = provided.images ?? [];
    if (ids.length === 0) {
      fields.push({ field: "provided.images", message: "Pick at least one image." });
    } else if (ids.length > imagesPerRunMax) {
      fields.push({
        field: "provided.images",
        message: `A run holds at most ${imagesPerRunMax} images.`,
      });
    }
    if (new Set(ids).size !== ids.length) {
      fields.push({ field: "provided.images", message: "The same image was picked twice." });
    }
    for (const [index, id] of ids.entries()) {
      checkFile(staged, id, "images", `provided.images.${index}`, "Pick an image.", fields);
    }
  }
}

// logic/05 §Q44: a run never starts with provided content that is missing or still copying.
function checkFile(
  staged: readonly StagedFile[],
  id: string | undefined,
  kind: StageKind,
  field: string,
  missing: string,
  fields: FieldError[],
): void {
  if (id === undefined || id === "") {
    fields.push({ field, message: missing });
    return;
  }
  const file = staged.find((candidate) => candidate.id === id);
  if (file === undefined || file.stageKind !== kind) {
    fields.push({ field, message: "That upload is no longer available; pick the file again." });
    return;
  }
  if (file.state !== "staged") {
    fields.push({ field, message: "This upload is still copying." });
  }
}

// logic/03 step 4 and §Q26.
function checkValues(
  draft: RunDraft,
  requiredSlots: readonly string[],
  fields: FieldError[],
): void {
  for (const name of requiredSlots) {
    const value = Object.hasOwn(draft.values, name) ? draft.values[name] : undefined;
    if (value === undefined || value === "") {
      fields.push({ field: `values.${name}`, message: "This field is required." });
      continue;
    }
    if (value.length > valueMax) {
      fields.push({
        field: `values.${name}`,
        message: `A value is at most ${valueMax} characters.`,
      });
    }
    if (/[\n\r]/.test(value)) {
      fields.push({ field: `values.${name}`, message: "A value is a single line." });
    }
  }
}

function blank(value: string | undefined): boolean {
  return value === undefined || value.trim() === "";
}

function chosen(choice: ProviderChoice | undefined): boolean {
  return choice !== undefined && choice.provider.trim() !== "" && choice.model.trim() !== "";
}
