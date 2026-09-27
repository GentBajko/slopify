import type { StageKind } from "../../kernel/pipeline.js";
import { stageKinds } from "../../kernel/pipeline.js";
import type { NarrationAlias } from "../../kernel/ports/narration-aliases.js";
import { imageScaleProblem } from "../images/scale.js";
import { loudnessFields } from "../loudness/model.js";
import { pauseFields } from "../narration/pauses-model.js";
import { reviewFields } from "../reviews/rules.js";
import { shortsSettingsProblems } from "../shorts/model.js";
import type { StagedFile } from "../storage/model.js";
import { ambientBedProblems, usesAmbientBed } from "../video/ambient-bed.js";
import { usesAnimation, videoEditProblems } from "../video/edit-settings.js";
import { usesVoices, voicesProblems } from "../voices/model.js";
import type { MotionStyle, ProviderChoice, RunDraft, StageSource } from "./model.js";
import { sourceOf } from "./model.js";
import { shortModeFields } from "./short-mode.js";

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
export const defaultMotionStyle: MotionStyle = "zoom";
// The words Play, Edit project and the change preview use for each motion style.
export const motionStyleLabels: Readonly<Record<MotionStyle, string>> = {
  zoom: "Zoom in and out",
  pan: "Pan across",
  mixed: "Mix of both",
  still: "Still",
};

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
  document: ["off", "generate"],
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
    if (!allowedSources[kind].includes(sourceOf(sources, kind))) {
      fields.push({
        field: `sources.${kind}`,
        message: `"${sourceOf(sources, kind)}" is not an option for ${kind}. Reload the page and choose again.`,
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
    usesNarrationPreparation(draft) ||
    usesYoutubeDescription(draft) ||
    usesShorts(draft) ||
    (usesVoices(draft) && draft.voices?.source === "attribute");
  if (needsLlm && !chosen(draft.llm)) {
    fields.push({ field: "llm", message: "Choose a text (LLM) provider and model." });
  }

  if (sources.article === "generate" && blank(draft.articlePrompt)) {
    fields.push({ field: "articlePrompt", message: "Pick an article prompt." });
  }

  const voiced = draft.audio;
  fields.push(...narrationPreparationFields(draft));
  fields.push(...voicesFields(draft));
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
      sources.thumbnail === "prompt_by_llm" ||
      usesShorts(draft) ||
      usesAnimation(draft)) &&
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
  fields.push(...youtubeDescriptionFields(draft));
  fields.push(...shortsFields(draft));
  fields.push(...shortModeFields(draft));
  fields.push(...videoEditFields(draft));
  fields.push(...ambientBedFields(draft, input.staged));
  fields.push(...loudnessFields(draft.loudness));
  fields.push(...pauseFields(draft));
  fields.push(...referenceFields(draft));
  fields.push(...reviewFields(draft));
  if (usesReference(draft) && draft.reference?.source === "provide")
    checkFile(
      input.staged,
      draft.provided.reference,
      "images",
      "provided.reference",
      "Upload the establishing image, or set Establishing image to Off in the Images section.",
      fields,
    );
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
  const scaleProblem =
    draft.imageScale === undefined ? undefined : imageScaleProblem(draft.imageScale);
  if (scaleProblem !== undefined) fields.push({ field: "imageScale", message: scaleProblem });
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
  checkShortsMusic(draft, staged, fields);
}

// The shorts' background music is optional, so only a file that was picked is checked, and
// only while Shorts is on. Named by where the control sits: Play's Export rail.
function checkShortsMusic(
  draft: RunDraft,
  staged: readonly StagedFile[],
  fields: FieldError[],
): void {
  const id = draft.provided.shortsMusic;
  if (draft.shorts?.enabled !== true || id === undefined) return;
  const where = "under Outputs → More shorts options → Background music";
  const file = staged.find((candidate) => candidate.id === id);
  if (file === undefined || file.stageKind !== "audio")
    fields.push({
      field: "shorts.music",
      message: `The shorts' background music file is no longer available, so it can't be added to the project. Choose the file again ${where}, or remove it.`,
    });
  else if (file.state !== "staged")
    fields.push({
      field: "shorts.music",
      message: `The shorts' background music is still uploading, so the run can't start yet. Wait for it to finish, or remove it ${where}.`,
    });
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

// Multiple voices, checked only while narration is generated: a format left set with
// narration Off or uploaded asks for nothing.
export function voicesFields(
  draft: Pick<RunDraft, "sources" | "voices" | "narrationPrompt">,
): readonly FieldError[] {
  if (draft.voices === undefined || !usesVoices(draft)) return [];
  const fields: FieldError[] = [...voicesProblems(draft.voices)];
  // Preparation adds delivery tags to the turns of speakers on Inworld TTS-2, so it needs one.
  if (
    !blank(draft.narrationPrompt) &&
    !draft.voices.speakers.some(
      (speaker) => speaker.voice.provider === "inworld" && speaker.voice.model === "inworld-tts-2",
    )
  )
    fields.push({
      field: "narrationPrompt",
      message:
        "Narration preparation adds delivery cues only to speakers on Inworld's TTS-2 model, and no speaker uses it. Choose that model for a speaker under Speakers, or clear Narration Preparation under Narration → Audio Advanced.",
    });
  return fields;
}

// The YouTube description is written from the narration's word timings, so it needs
// narration; it runs whether the video renders or only the WAV is exported.
export function usesYoutubeDescription(
  draft: Pick<RunDraft, "sources" | "youtubeDescription">,
): boolean {
  return draft.youtubeDescription === true && draft.sources.audio !== "off";
}

export function youtubeDescriptionFields(
  draft: Pick<RunDraft, "sources" | "youtubeDescription">,
): readonly FieldError[] {
  return draft.youtubeDescription === true && draft.sources.audio === "off"
    ? [
        {
          field: "youtubeDescription",
          message:
            "The YouTube description is timed from the narration. Turn narration on, or turn the YouTube description off.",
        },
      ]
    : [];
}

// The establishing image belongs to the Images stage: it is made, and the images drawn with
// it, only while images are Generate.
export function usesReference(draft: Pick<RunDraft, "sources" | "reference">): boolean {
  return draft.reference !== undefined && draft.sources.images === "generate";
}
// Whether the thumbnail is drawn with it too: on unless turned off, and only for a thumbnail
// the image provider makes.
export function referenceForThumbnail(draft: Pick<RunDraft, "sources" | "reference">): boolean {
  return (
    usesReference(draft) &&
    draft.reference?.thumbnail !== false &&
    (draft.sources.thumbnail === "from_prompt" || draft.sources.thumbnail === "prompt_by_llm")
  );
}
export function referenceFields(
  draft: Pick<RunDraft, "sources" | "reference">,
): readonly FieldError[] {
  return usesReference(draft) &&
    draft.reference?.source === "prompt" &&
    (draft.reference.prompt === undefined || draft.reference.prompt.trim() === "")
    ? [
        {
          field: "reference.prompt",
          message:
            "Pick an image prompt for the establishing image, upload one instead, or set Establishing image to Off in the Images section.",
        },
      ]
    : [];
}

// Shorts are cut from the narration and captioned from its word timings, so they need
// narration, like the YouTube description; they run whether the video renders or not.
export function usesShorts(draft: Pick<RunDraft, "sources" | "shorts">): boolean {
  return draft.shorts?.enabled === true && draft.sources.audio !== "off";
}

export function shortsFields(
  draft: Pick<RunDraft, "sources" | "shorts" | "imageSeconds">,
): readonly FieldError[] {
  const shorts = draft.shorts;
  if (shorts?.enabled !== true) return [];
  if (draft.sources.audio === "off")
    return [
      {
        field: "shorts.enabled",
        message: "Shorts are cut from the narration. Turn narration on, or turn Shorts off.",
      },
    ];
  const fields: FieldError[] = shortsSettingsProblems(shorts).map((problem) => ({
    field: `shorts.${problem.field}`,
    message: problem.message,
  }));
  // The shorts hold each image as long as the video does. With the video off nothing else
  // checks the number.
  const imageProblem =
    draft.sources.video === "generate" ? undefined : imageSecondsProblem(draft.imageSeconds);
  if (imageProblem !== undefined) fields.push({ field: "imageSeconds", message: imageProblem });
  return fields;
}

// The Video stage's edit settings, checked only while the video renders: a hidden setting
// cannot hold up a run.
export function videoEditFields(
  draft: Pick<RunDraft, "sources" | "videoEdit">,
): readonly FieldError[] {
  return videoEditProblems(draft).map((problem) => ({
    field: `videoEdit.${problem.field}`,
    message: problem.message,
  }));
}

// The ambient bed, checked only while the long video renders with narration; its own file only
// while the source is "upload". Named by where the control sits: Play's Export rail.
export function ambientBedFields(
  draft: Pick<RunDraft, "sources" | "ambientBed" | "provided">,
  staged: readonly StagedFile[],
): readonly FieldError[] {
  const bed = draft.ambientBed;
  if (bed === undefined || !usesAmbientBed(draft)) return [];
  const where = "under Video and style → Ambient sound";
  const fields: FieldError[] = ambientBedProblems(bed).map((problem) => ({
    field: `ambientBed.${problem.field}`,
    message: `${problem.message} Change it ${where}.`,
  }));
  if (bed.source !== "upload") return fields;
  const id = draft.provided.ambientBed;
  const file = id === undefined ? undefined : staged.find((candidate) => candidate.id === id);
  if (file === undefined || file.stageKind !== "audio")
    fields.push({
      field: "ambientBed.file",
      message: `The ambient sound's audio file is missing, so it can't be added to the project. Choose the file ${where}, or pick Rain, Fireplace or Wind instead.`,
    });
  else if (file.state !== "staged")
    fields.push({
      field: "ambientBed.file",
      message: `The ambient sound's audio file is still uploading, so the run can't start yet. Wait for it to finish ${where}.`,
    });
  return fields;
}

function chosen(choice: ProviderChoice | undefined): boolean {
  return choice !== undefined && choice.provider.trim() !== "" && choice.model.trim() !== "";
}

// The aliases a run narrates with: its copied Library → Aliases while Use narration aliases is
// on for generated audio, otherwise none. Any voice provider: an alias is plain text.
export function narrationAliasesOf(
  draft: Pick<RunDraft, "sources" | "audio" | "narrationAliases">,
): readonly NarrationAlias[] {
  return draft.sources.audio === "generate" && draft.audio?.useNarrationAliases === true
    ? (draft.narrationAliases ?? [])
    : [];
}

// Describe tables and figures in the narration: generated narration, the setting on, and a
// text model to write the descriptions. Without a text model the narration flattens the
// article as it always did, so the default being on never asks for one.
export function usesDescribedNarration(
  draft: Pick<RunDraft, "sources" | "audio" | "llm">,
): boolean {
  return (
    draft.sources.audio === "generate" && draft.audio?.describeFigures === true && chosen(draft.llm)
  );
}

// "Show tables and figures on screen": a video, and the narration describing its blocks.
export function usesFigureCards(
  draft: Pick<RunDraft, "sources" | "audio" | "llm" | "showFigures">,
): boolean {
  return (
    usesDescribedNarration(draft) &&
    draft.sources.video === "generate" &&
    draft.showFigures === true
  );
}

export function usesPronunciationGlossary(draft: Pick<RunDraft, "sources" | "audio">): boolean {
  return (
    draft.sources.audio === "generate" &&
    draft.audio?.usePronunciationGlossary === true &&
    draft.audio.provider === "inworld" &&
    (draft.audio.model === "inworld-tts-2" || draft.audio.model === "inworld-tts-2-flash")
  );
}
