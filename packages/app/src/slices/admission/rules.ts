import type { StageKind } from "../../kernel/pipeline.js";
import { stageKinds } from "../../kernel/pipeline.js";
import type { StagedFile } from "../storage/model.js";
import type { ProviderChoice, RunDraft, StageSource } from "./model.js";

export interface FieldError {
  // Dotted path of the control on Play, so the form marks it in place.
  readonly field: string;
  readonly message: string;
}

export type AdmissionResult =
  | { readonly ok: true; readonly draft: RunDraft }
  | { readonly ok: false; readonly fields: readonly FieldError[] };

export interface AdmissionInput {
  readonly draft: RunDraft;
  readonly staged: readonly StagedFile[];
  // The distinct slot names the selected prompt bodies and picked entries ask for. The caller
  // collects them; the rule only checks the values.
  readonly requiredSlots: readonly string[];
}

export const titleMax = 200;
export const valueMax = 200;
export const numberPerPromptMax = 20;
export const imagesPerRunMax = 60;
// ceiling: the default gap is 3 s and nothing fixes an upper or lower bound, so the range
// is this module's. A wider gap is a settings change, not a schema change.
export const silenceGapSecondsMax = 30;
// ceiling: the owner's numbers. A still held past ten minutes is a separate kind of video.
export const imageSecondsMin = 1;
export const imageSecondsMax = 600;
export const defaultImageSeconds = 15;
// ceiling: the same 30 s as the gap; half seconds are enough precision for a pause.
export const edgeSilenceSecondsMax = 30;
export const defaultEdgeSilenceSeconds = 2;
// ceiling: past 50% the crop loses more of the picture than it shows.
export const zoomPercentMax = 50;
export const defaultZoomPercent = 22.5;

// Shared by admission, Play's draft conversion and Edit project, so all three say the same
// sentence about the same value.
export function imageSecondsProblem(value: number): string | undefined {
  return Number.isInteger(value) && value >= imageSecondsMin && value <= imageSecondsMax
    ? undefined
    : `Enter a whole number of seconds between ${imageSecondsMin} and ${imageSecondsMax}.`;
}

export function zoomPercentProblem(value: number): string | undefined {
  return Number.isInteger(value * 2) && value >= 0 && value <= zoomPercentMax
    ? undefined
    : `Enter a zoom between 0 and ${zoomPercentMax} percent, in steps of 0.5.`;
}

export function edgeSilenceSecondsProblem(value: number): string | undefined {
  return Number.isInteger(value * 2) && value >= 0 && value <= edgeSilenceSecondsMax
    ? undefined
    : `Enter a number of seconds between 0 and ${edgeSilenceSecondsMax}, in steps of 0.5.`;
}

// The legal source for each stage. Exported because Play's
// source switches offer exactly these and nothing else, so the segmented control and the
// refusal below it are the same list and a stage whose legal set changes cannot leave a
// switch offering something the server refuses. The order is the order the segments are
// drawn in; the rule itself only asks whether a source is on its stage's list.
export const allowedSources: Readonly<Record<StageKind, readonly StageSource[]>> = {
  research: ["off", "generate", "provide"],
  article: ["generate", "provide"],
  audio: ["off", "generate", "provide"],
  images: ["off", "generate", "provide"],
  thumbnail: ["off", "from_prompt", "prompt_by_llm", "provide"],
  video: ["off", "generate"],
};

export function admit(input: AdmissionInput): AdmissionResult {
  const fields: FieldError[] = [];
  const draft = normaliseDraft(input.draft);
  const { sources } = draft;

  if (draft.title === "") {
    fields.push({ field: "title", message: "Enter a title for this video." });
  } else if (draft.title.length > titleMax) {
    fields.push({ field: "title", message: `Keep the title to ${titleMax} characters or fewer.` });
  }

  for (const kind of stageKinds) {
    if (!allowedSources[kind].includes(sources[kind])) {
      fields.push({
        field: `sources.${kind}`,
        message: `"${sources[kind]}" is not an option for ${kind}. Reload the page and choose again.`,
      });
    }
  }

  // The LLM row is required only when something in the run actually asks an LLM for text.
  const needsLlm =
    sources.research === "generate" ||
    sources.article === "generate" ||
    sources.thumbnail === "prompt_by_llm" ||
    draft.intro?.mode === "llm" ||
    draft.outro?.mode === "llm" ||
    usesNarrationPreparation(draft);
  if (needsLlm && !chosen(draft.llm)) {
    fields.push({ field: "llm", message: "Choose a text (LLM) provider and model." });
  }

  if (sources.article === "generate" && blank(draft.articlePrompt)) {
    fields.push({ field: "articlePrompt", message: "Pick an article prompt." });
  }

  const voiced = draft.audio;
  fields.push(...narrationPreparationFields(draft));
  if (sources.audio === "generate") {
    if (voiced === undefined || !chosen(voiced)) {
      fields.push({ field: "audio", message: "Choose a narration provider and model." });
    } else if (voiced.voice.trim() === "") {
      fields.push({ field: "audio.voice", message: "Choose a voice for the narration." });
    }
  }

  if (sources.images === "generate") {
    checkImagePrompts(draft, fields);
  }
  if (
    (sources.images === "generate" ||
      sources.thumbnail === "from_prompt" ||
      sources.thumbnail === "prompt_by_llm") &&
    !chosen(draft.images)
  ) {
    fields.push({ field: "images", message: "Choose an image provider and model." });
  }

  if (
    (sources.thumbnail === "from_prompt" || sources.thumbnail === "prompt_by_llm") &&
    blank(draft.thumbnailPrompt)
  ) {
    fields.push({ field: "thumbnailPrompt", message: "Pick a thumbnail prompt." });
  }

  if (sources.audio === "off" && draft.subtitles !== undefined && draft.subtitles.mode !== "off") {
    fields.push({
      field: "subtitles.mode",
      message: "Subtitles need narration. Turn narration on, or turn subtitles off.",
    });
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
      message: `Enter a silence gap between 0 and ${silenceGapSecondsMax} seconds.`,
    });
  }
  // Checked only where they are used: a hidden control cannot hold up a run.
  const imageProblem =
    sources.video === "generate" ? imageSecondsProblem(draft.imageSeconds) : undefined;
  if (imageProblem !== undefined) fields.push({ field: "imageSeconds", message: imageProblem });
  const zoomProblem =
    sources.video === "generate" ? zoomPercentProblem(draft.zoomPercent) : undefined;
  if (zoomProblem !== undefined) fields.push({ field: "zoomPercent", message: zoomProblem });
  const edgeProblem =
    sources.audio === "off" ? undefined : edgeSilenceSecondsProblem(draft.edgeSilenceSeconds);
  if (edgeProblem !== undefined) fields.push({ field: "edgeSilenceSeconds", message: edgeProblem });

  return fields.length === 0 ? { ok: true, draft } : { ok: false, fields };
}

// Research only feeds article writing, so a provided article hides it.
// Disabling images chooses audio export. Uploaded narration is used as-is, and
// only generated narration uses separately selected intro/outro entries.
export function normaliseDraft(draft: RunDraft): RunDraft {
  const sources = { ...draft.sources };
  if (sources.article === "provide") {
    sources.research = "off";
  }
  if (sources.images === "off" && sources.video === "generate") {
    sources.video = "off";
  }
  // Prototype-free, because a slot name is user-authored: `{{constructor}}` would
  // otherwise answer with Object rather than undefined and pass the "required" check, and
  // a value posted under `__proto__` would run a setter instead of being stored.
  const values = Object.create(null) as Record<string, string>;
  for (const [name, value] of Object.entries(draft.values)) {
    values[name] = value.trim();
  }
  return {
    ...draft,
    title: draft.title.trim(),
    subtitles:
      sources.video === "off" && draft.subtitles?.mode === "burn-in"
        ? { ...draft.subtitles, mode: "files" }
        : draft.subtitles,
    sources,
    values,
    intro: sources.audio === "generate" ? draft.intro : undefined,
    outro: sources.audio === "generate" ? draft.outro : undefined,
  };
}

function checkImagePrompts(draft: RunDraft, fields: FieldError[]): void {
  if (draft.imagePrompts.length === 0) {
    // A run always has an image source.
    fields.push({
      field: "imagePrompts",
      message: "Tick at least one image prompt, or turn images off.",
    });
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
        message: `Enter a whole number between 1 and ${numberPerPromptMax}.`,
      });
    }
  }
  if (total > imagesPerRunMax) {
    fields.push({
      field: "imagePrompts",
      message: `A video can have at most ${imagesPerRunMax} images; these prompts ask for ${total}. Lower the numbers.`,
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
        message: `A video can have at most ${imagesPerRunMax} images. Remove some.`,
      });
    }
    if (new Set(ids).size !== ids.length) {
      fields.push({
        field: "provided.images",
        message: "The same image is picked twice. Remove the duplicate.",
      });
    }
    for (const [index, id] of ids.entries()) {
      checkFile(staged, id, "images", `provided.images.${index}`, "Pick an image.", fields);
    }
  }
}

// A run never starts with provided content that is missing or still copying.
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
    fields.push({ field, message: "That upload is no longer available. Choose the file again." });
    return;
  }
  if (file.state !== "staged") {
    fields.push({ field, message: "This file is still uploading. Wait for it to finish." });
  }
}

function checkValues(
  draft: RunDraft,
  requiredSlots: readonly string[],
  fields: FieldError[],
): void {
  for (const name of requiredSlots) {
    const value = Object.hasOwn(draft.values, name) ? draft.values[name] : undefined;
    if (value === undefined || value === "") {
      fields.push({ field: `values.${name}`, message: "Fill in this field." });
      continue;
    }
    if (value.length > valueMax) {
      fields.push({
        field: `values.${name}`,
        message: `Keep this to ${valueMax} characters or fewer.`,
      });
    }
    if (/[\n\r]/.test(value)) {
      fields.push({
        field: `values.${name}`,
        message: "Keep this to a single line, without line breaks.",
      });
    }
  }
}

function blank(value: string | undefined): boolean {
  return value === undefined || value.trim() === "";
}

export function usesNarrationPreparation(
  draft: Pick<RunDraft, "sources" | "narrationPrompt">,
): boolean {
  return draft.sources.audio === "generate" && !blank(draft.narrationPrompt);
}

export function narrationPreparationFields(draft: RunDraft): readonly FieldError[] {
  return usesNarrationPreparation(draft) &&
    (draft.audio?.provider !== "inworld" || draft.audio.model !== "inworld-tts-2")
    ? [
        {
          field: "narrationPrompt",
          message:
            "Narration preparation only works with the Inworld TTS-2 model. Choose that model under Narration, or turn preparation Off.",
        },
      ]
    : [];
}

function chosen(choice: ProviderChoice | undefined): boolean {
  return choice !== undefined && choice.provider.trim() !== "" && choice.model.trim() !== "";
}

export function usesPronunciationGlossary(draft: Pick<RunDraft, "sources" | "audio">): boolean {
  return (
    draft.sources.audio === "generate" &&
    draft.audio?.usePronunciationGlossary === true &&
    draft.audio.provider === "inworld" &&
    (draft.audio.model === "inworld-tts-2" || draft.audio.model === "inworld-tts-2-flash")
  );
}
