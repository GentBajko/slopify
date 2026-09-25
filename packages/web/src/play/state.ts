import type { StageKind } from "@app/kernel/pipeline.js";
import type {
  EntryChoice,
  EntryMode,
  Format,
  ImagePromptChoice,
  MotionStyle,
  ProviderChoice,
  RunDraft,
  StageSource,
  VoiceChoice,
} from "@app/slices/admission/model.js";
import {
  allowedSources,
  defaultEdgeSilenceSeconds,
  defaultImageSeconds,
  defaultZoomPercent,
  usesNarrationPreparation,
} from "@app/slices/admission/rules.js";
import { type DocumentSettings, defaultDocumentTheme } from "@app/slices/document/model.js";
import type { Entry } from "@app/slices/library/model.js";
import type { Chunking } from "@app/slices/narration/chunk.js";
import type { StagedFile } from "@app/slices/storage/model.js";
import { defaultSubtitles, type SubtitleConfig } from "@app/slices/subtitles/model.js";
import { subtitlesFor } from "@/subtitles/config";
import { freshDraftDocument } from "./draft-state";

// One picked file and how far its copy into staging got. A file starts copying the moment it is
// picked; until the copy finishes the run cannot start. The whole staged row is kept rather
// than its id, because the admission rule the form runs live is handed the same rows the
// server's own copy is handed.
export interface Upload {
  readonly key: string;
  readonly name: string;
  readonly file: StagedFile | undefined;
  readonly error: string | undefined;
}

export interface ProvidedState {
  readonly research: string;
  readonly article: string;
  readonly audio: Upload | undefined;
  readonly images: readonly Upload[];
  readonly thumbnail: Upload | undefined;
}

export interface LegacyPlayFormState {
  readonly checkpoints?: RunDraft["checkpoints"];
  readonly title: string;
  readonly format: Format;
  readonly sources: Readonly<Record<StageKind, StageSource>>;
  readonly llm: ProviderChoice;
  readonly audio: VoiceChoice;
  readonly images: ProviderChoice;
  readonly articlePrompt: string;
  readonly narrationPrompt?: string | undefined;
  // The ticked image prompts, in tick order, each with its Number.
  readonly imagePrompts: readonly ImagePromptChoice[];
  readonly thumbnailPrompt: string;
  // The picked entry's name, or "" for Off.
  readonly intro: string;
  readonly outro: string;
  readonly chunking: Chunking;
  readonly subtitles: SubtitleConfig;
  // NaN while the typed text is not a number, so the shared rule refuses it in place.
  readonly imageSeconds: number;
  readonly edgeSilenceSeconds: number;
  readonly zoomPercent: number;
  readonly motionStyle: MotionStyle;
  // Read with the saved draft's absent Document fields filled in: Off and the default theme.
  readonly document: DocumentSettings;
  // Every value the user has typed, including one for a slot no prompt asks for any more:
  // unticking a prompt and ticking it again gives its field back with what was in it.
  readonly values: Readonly<Record<string, string>>;
  readonly provided: ProvidedState;
}

// Existing controls keep the numeric representation until their raw-input migration.
export type PlayFormState = LegacyPlayFormState;

// Format 16:9; intro and outro Off; research Off; thumbnail Off; article, audio and images
// Generate; nothing else picked. Whole-text chunking is the case that adds nothing the user
// did not ask for.
export const freshForm: PlayFormState = {
  ...freshDraftDocument.form,
  sources: { ...freshDraftDocument.form.sources, document: "off" },
  document: { theme: defaultDocumentTheme },
  imagePrompts: [],
  chunking: { mode: "whole" },
  subtitles: defaultSubtitles,
  imageSeconds: defaultImageSeconds,
  edgeSilenceSeconds: defaultEdgeSilenceSeconds,
  zoomPercent: defaultZoomPercent,
  values: {},
  provided: { research: "", article: "", audio: undefined, images: [], thumbnail: undefined },
};

export const sourceLabels: Readonly<Record<StageSource, string>> = {
  off: "Off",
  generate: "Generate",
  provide: "Provide",
  from_prompt: "From prompt",
  prompt_by_llm: "Prompt by LLM",
};

// The switch a stage draws, straight from the rule that will judge it.
export function sourceOptions(
  kind: StageKind,
): readonly { readonly value: StageSource; readonly label: string }[] {
  return allowedSources[kind].map((value) => ({ value, label: sourceLabels[value] }));
}

// The LLM-row rule, said in the form's own vocabulary so the cue sheet can hide the row
// before anything is posted. Admission says it again over the draft; this only decides
// whether the row is drawn at all.
export function needsLlm(form: PlayFormState, entries: readonly Entry[]): boolean {
  return (
    usesNarrationPreparation(form) ||
    form.sources.article === "generate" ||
    form.sources.thumbnail === "prompt_by_llm" ||
    (form.sources.audio === "generate" &&
      (modeOf(entries, "intro", form.intro) === "llm" ||
        modeOf(entries, "outro", form.outro) === "llm"))
  );
}

export function modeOf(
  entries: readonly Entry[],
  category: "intro" | "outro",
  name: string,
): EntryMode | undefined {
  if (name === "") {
    return undefined;
  }
  return entries.find((entry) => entry.category === category && entry.name === name)?.mode;
}

// Every staged row the form knows about, which is what the admission rule checks the
// provided ids against.
export function stagedOf(provided: ProvidedState): readonly StagedFile[] {
  return [provided.audio, provided.thumbnail, ...provided.images].flatMap((upload) =>
    upload?.file === undefined ? [] : [upload.file],
  );
}

export interface DraftInput {
  readonly form: PlayFormState;
  readonly entries: readonly Entry[];
  // The names the picked prompts and entries ask for: a value the run no longer needs is
  // not carried onto the project.
  readonly slots: readonly string[];
  // The gap beside a segment that exists, as Settings has it.
  readonly silenceGapSeconds: number;
}

export function draftOf(input: DraftInput): RunDraft {
  const { form } = input;
  return {
    ...(form.checkpoints === undefined ? {} : { checkpoints: form.checkpoints }),
    title: form.title,
    format: form.format,
    sources: {
      ...form.sources,
      ...(form.sources.article === "provide" ? { research: "off" as const } : {}),
      ...(form.sources.images === "off" ? { video: "off" as const } : {}),
    },
    llm: form.llm,
    audio: form.audio,
    images: form.images,
    articlePrompt: form.articlePrompt,
    ...(form.narrationPrompt === undefined ? {} : { narrationPrompt: form.narrationPrompt }),
    imagePrompts: form.imagePrompts,
    thumbnailPrompt: form.thumbnailPrompt,
    ...pick(entryChoice(input, "intro"), (intro) => ({ intro })),
    ...pick(entryChoice(input, "outro"), (outro) => ({ outro })),
    values: valuesFor(form.values, input.slots),
    provided: {
      research: form.provided.research,
      article: form.provided.article,
      ...pick(form.provided.audio?.file, (file) => ({ audio: file.id })),
      ...pick(form.provided.thumbnail?.file, (file) => ({ thumbnail: file.id })),
      images: form.provided.images.flatMap((image) =>
        image.file === undefined ? [] : [image.file.id],
      ),
    },
    chunking: form.chunking,
    subtitles: subtitlesFor(form.subtitles, form.sources),
    silenceGapSeconds: input.silenceGapSeconds,
    imageSeconds: form.imageSeconds,
    edgeSilenceSeconds: form.edgeSilenceSeconds,
    zoomPercent: form.zoomPercent,
    motionStyle: form.motionStyle,
    ...(form.sources.document === "generate" ? { document: form.document } : {}),
  };
}

// `exactOptionalPropertyTypes` is on, so an optional member is either written with a
// value or not written at all. This spreads nothing for the absent case and keeps the
// member's own name at the call site.
function pick<T, R extends object>(value: T | undefined, into: (present: T) => R): R | object {
  return value === undefined ? {} : into(value);
}

// The request says which entry; the library says what it is. The server reads the saved
// mode again before it judges the draft (`slices/library/slots.ts`), so a stale mode here
// changes what the form shows and never what the run does.
function entryChoice(input: DraftInput, category: "intro" | "outro"): EntryChoice | undefined {
  if (input.form.sources.audio !== "generate") return undefined;
  const name = category === "intro" ? input.form.intro : input.form.outro;
  const mode = modeOf(input.entries, category, name);
  return name === "" || mode === undefined ? undefined : { name, mode };
}

function valuesFor(
  values: Readonly<Record<string, string>>,
  slots: readonly string[],
): Record<string, string> {
  // Prototype-free for the reason `slices/admission/rules.ts` gives: a slot name is
  // whatever the prompt author typed, "__proto__" included.
  const kept: Record<string, string> = Object.create(null) as Record<string, string>;
  for (const name of slots) {
    kept[name] = Object.hasOwn(values, name) ? (values[name] ?? "") : "";
  }
  return kept;
}
