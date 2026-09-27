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
  usesYoutubeDescription,
} from "@app/slices/admission/rules.js";
import { type DocumentSettings, defaultDocumentTheme } from "@app/slices/document/model.js";
import type { Entry } from "@app/slices/library/model.js";
import type { Chunking } from "@app/slices/narration/chunk.js";
import type { PlayDraftForm } from "@app/slices/play-drafts/schema.js";
import { type ShortsSettings, shortsExtrasOf } from "@app/slices/shorts/model.js";
import type { StagedFile } from "@app/slices/storage/model.js";
import { defaultSubtitles, type SubtitleConfig } from "@app/slices/subtitles/model.js";
import { ambientBedOfForm } from "@app/slices/video/ambient-bed.js";
import type { VideoEditSettings } from "@app/slices/video/edit-settings.js";
import type { UploadKind } from "@/api";
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

// Where a picked file goes on the draft: a stage's own file, the shorts' background music
// (uploaded as an audio attachment), the ambient bed's own file (audio too) or the
// establishing image (a reference attachment).
export type UploadSlot = UploadKind | "shortsMusic" | "ambientBed" | "reference";
export function attachmentKindOf(slot: UploadSlot): UploadKind | "reference" {
  return slot === "shortsMusic" || slot === "ambientBed" ? "audio" : slot;
}

export interface ProvidedState {
  readonly research: string;
  readonly article: string;
  readonly audio: Upload | undefined;
  readonly images: readonly Upload[];
  readonly thumbnail: Upload | undefined;
  // The uploaded establishing image; absent on drafts saved before it.
  readonly reference?: Upload | undefined;
  // The Shorts step's background music, an audio attachment. Absent until one is picked.
  readonly shortsMusic?: Upload | undefined;
  // The ambient bed's own file, an audio attachment. Absent until one is picked.
  readonly ambientBed?: Upload | undefined;
}

export interface LegacyPlayFormState {
  readonly checkpoints?: RunDraft["checkpoints"];
  readonly title: string;
  readonly format: Format;
  readonly sources: Readonly<Record<StageKind, StageSource>>;
  readonly llm: ProviderChoice;
  readonly audio: VoiceChoice;
  readonly images: ProviderChoice;
  // The Images stage's establishing image as the draft holds it; absent is Off.
  readonly reference?: PlayDraftForm["reference"];
  readonly articlePrompt: string;
  readonly narrationPrompt?: string | undefined;
  // The Video stage's YouTube description step and its Description prompt ("" is built-in).
  readonly youtubeDescription?: boolean | undefined;
  readonly descriptionPrompt?: string | undefined;
  // The project language as picked on Play; absent is the channel's, else English.
  readonly language?: PlayDraftForm["language"];
  // The Video stage's Shorts step, as the draft holds it: the numbers as typed, and the two
  // prompts' names ("" is built-in). Absent until Shorts is first touched: off.
  readonly shorts?: ShortsForm | undefined;
  // The ticked image prompts, in tick order, each with its Number.
  readonly imagePrompts: readonly ImagePromptChoice[];
  readonly thumbnailPrompt: string;
  // One or three generated thumbnails; absent is one.
  readonly thumbnailCount?: 1 | 3 | undefined;
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
  // The Video stage's edit settings (cuts, transitions, the Look, animated images). Absent on
  // drafts saved before them, which then render today's slideshow.
  readonly videoEdit?: VideoEditSettings | undefined;
  // Multiple voices, as the draft holds them; absent is the Narration format.
  readonly voices?: PlayDraftForm["voices"];
  // The ambient bed as the draft holds it, numbers as typed; absent takes the channel's.
  readonly ambientBed?: PlayDraftForm["ambientBed"];
  // Read with the saved draft's absent Document fields filled in: Off and the default theme.
  readonly document: DocumentSettings;
  // Every value the user has typed, including one for a slot no prompt asks for any more:
  // unticking a prompt and ticking it again gives its field back with what was in it.
  readonly values: Readonly<Record<string, string>>;
  readonly provided: ProvidedState;
}

export type ShortsForm = NonNullable<PlayDraftForm["shorts"]>;

// Whether the run makes shorts: switched on, with narration to cut them from.
export function shortsOn(form: {
  readonly sources: { readonly audio: StageSource };
  readonly shorts?: { readonly enabled: boolean } | undefined;
}): boolean {
  return form.shorts?.enabled === true && form.sources.audio !== "off";
}

// Whether the run plays the ambient bed from the user's own file: the long video renders with
// narration and the bed's source is My own file.
export function ambientUploadOn(form: {
  readonly sources: { readonly audio: StageSource; readonly video: StageSource };
  readonly ambientBed?: PlayDraftForm["ambientBed"];
}): boolean {
  return (
    form.ambientBed?.source === "upload" &&
    form.sources.video === "generate" &&
    form.sources.audio !== "off"
  );
}

// The typed numbers as the rule reads them: NaN while one is not a number, so the shared rule
// refuses it in place.
export function shortsSettingsOf(form: ShortsForm): ShortsSettings {
  const typed = (value: string): number => (value.trim() === "" ? Number.NaN : Number(value));
  return {
    enabled: form.enabled,
    count: typed(form.count),
    minSeconds: typed(form.minSeconds),
    maxSeconds: typed(form.maxSeconds),
    ...(form.prompt.trim() ? { prompt: form.prompt } : {}),
    ...(form.imagePrompt.trim() ? { imagePrompt: form.imagePrompt } : {}),
    ...shortsExtrasOf(form),
  };
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
    usesYoutubeDescription(form) ||
    shortsOn(form) ||
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
  return [
    provided.audio,
    provided.thumbnail,
    provided.shortsMusic,
    provided.ambientBed,
    provided.reference,
    ...provided.images,
  ].flatMap((upload) => (upload?.file === undefined ? [] : [upload.file]));
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
    // As `slices/play-drafts/convert.ts` sends it: only while images are generated.
    ...(form.sources.images === "generate" &&
    form.reference !== undefined &&
    form.reference.source !== "off"
      ? {
          reference: {
            source: form.reference.source,
            ...(form.reference.source === "prompt" ? { prompt: form.reference.prompt } : {}),
            thumbnail: form.reference.thumbnail,
          },
        }
      : {}),
    articlePrompt: form.articlePrompt,
    ...(form.narrationPrompt === undefined ? {} : { narrationPrompt: form.narrationPrompt }),
    // As `slices/play-drafts/convert.ts` sends it: English is never stored.
    ...(form.language === undefined || form.language === "en" ? {} : { language: form.language }),
    // As `slices/play-drafts/convert.ts` sends it: timed from the narration, so nothing with
    // narration Off.
    ...(form.sources.audio !== "off" && form.youtubeDescription === true
      ? {
          youtubeDescription: true,
          ...(form.descriptionPrompt?.trim() ? { descriptionPrompt: form.descriptionPrompt } : {}),
        }
      : {}),
    ...(shortsOn(form) && form.shorts !== undefined
      ? { shorts: shortsSettingsOf(form.shorts) }
      : {}),
    imagePrompts: form.imagePrompts,
    thumbnailPrompt: form.thumbnailPrompt,
    // As `slices/play-drafts/convert.ts` sends it: three only for a drawn thumbnail.
    ...(form.thumbnailCount === 3 &&
    (form.sources.thumbnail === "from_prompt" || form.sources.thumbnail === "prompt_by_llm")
      ? { thumbnailCount: 3 as const }
      : {}),
    ...pick(entryChoice(input, "intro"), (intro) => ({ intro })),
    ...pick(entryChoice(input, "outro"), (outro) => ({ outro })),
    values: valuesFor(form.values, input.slots),
    provided: {
      research: form.provided.research,
      article: form.provided.article,
      ...pick(form.provided.audio?.file, (file) => ({ audio: file.id })),
      ...pick(form.provided.thumbnail?.file, (file) => ({ thumbnail: file.id })),
      ...pick(
        form.sources.images === "generate" && form.reference?.source === "provide"
          ? form.provided.reference?.file
          : undefined,
        (file) => ({ reference: file.id }),
      ),
      images: form.provided.images.flatMap((image) =>
        image.file === undefined ? [] : [image.file.id],
      ),
      // As `slices/play-drafts/convert.ts` sends it: only while the run makes shorts.
      ...(shortsOn(form)
        ? pick(form.provided.shortsMusic?.file, (file) => ({ shortsMusic: file.id }))
        : {}),
      ...(form.ambientBed?.source === "upload"
        ? pick(form.provided.ambientBed?.file, (file) => ({ ambientBed: file.id }))
        : {}),
    },
    chunking: form.chunking,
    subtitles: subtitlesFor(form.subtitles, form.sources),
    silenceGapSeconds: input.silenceGapSeconds,
    imageSeconds: form.imageSeconds,
    edgeSilenceSeconds: form.edgeSilenceSeconds,
    zoomPercent: form.zoomPercent,
    motionStyle: form.motionStyle,
    ...(form.videoEdit === undefined ? {} : { videoEdit: form.videoEdit }),
    ...(form.voices !== undefined && form.sources.audio === "generate"
      ? { voices: form.voices }
      : {}),
    ...(form.sources.document === "generate" ? { document: form.document } : {}),
    // As `slices/play-drafts/convert.ts` sends it: under the long video's narration only.
    ...pick(
      form.sources.video === "generate" && form.sources.audio !== "off"
        ? ambientBedOfForm(form.ambientBed)
        : undefined,
      (ambientBed) => ({ ambientBed }),
    ),
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
