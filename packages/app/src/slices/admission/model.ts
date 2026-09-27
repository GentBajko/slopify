import type { Format, ProjectState, StageKind, StageState } from "../../kernel/pipeline.js";
import type { NarrationAlias } from "../../kernel/ports/narration-aliases.js";
import type { DocumentSettings } from "../document/model.js";
import type { Chunking } from "../narration/chunk.js";
import type { SubtitleConfig } from "../subtitles/model.js";

export type { Format } from "../../kernel/pipeline.js";
// The format is the kernel's: the image port asks for the same two aspects.
export { formats } from "../../kernel/pipeline.js";

// Generate, Provide or Off for most stages, plus the thumbnail's two Generate modes.
// Article stays Generate or Provide; Video and Document can be Generate or Off.
export const stageSources = ["generate", "provide", "off", "from_prompt", "prompt_by_llm"] as const;
export type StageSource = (typeof stageSources)[number];

// One source per stage. Document came after projects, drafts, templates, schedules and
// backups had been saved without it, so its source may be absent and then reads as Off:
// read any stage's source through `sourceOf`.
export type StageSources = Readonly<Record<Exclude<StageKind, "document">, StageSource>> & {
  readonly document?: StageSource | undefined;
};

export function sourceOf(sources: StageSources, kind: StageKind): StageSource {
  return sources[kind] ?? "off";
}

// How each slideshow image moves while it is on screen: Zoom in and out, Pan across, a
// Mix of both taking turns, or Still. `video/motion.ts` has the rules.
export const motionStyles = ["zoom", "pan", "mixed", "still"] as const;
export type MotionStyle = (typeof motionStyles)[number];

export const entryModes = ["text", "llm"] as const;
export type EntryMode = (typeof entryModes)[number];

export interface ProviderChoice {
  readonly thinking?: import("../../kernel/ports/llm.js").ThinkingMode | undefined;
  readonly provider: string;
  readonly model: string;
}

export interface VoiceChoice extends ProviderChoice {
  readonly voice: string;
  readonly usePronunciationGlossary?: boolean | undefined;
  // Also use the pronunciations of the user's other projects. Absent reads as off, so a
  // project saved before this existed narrates exactly as it did.
  readonly shareGlossary?: boolean | undefined;
  // Say Library → Aliases' words the way they are listed ("Dr." as "Doctor"). Absent reads as
  // off, so a project saved before aliases existed narrates exactly as it did.
  readonly useNarrationAliases?: boolean | undefined;
  // Describe tables, figures, equations and code in the narration: the text model writes a
  // short spoken passage for each (`narration/blocks.ts`). Stored only when on; absent reads
  // as off, so a project saved before it narrates the flattened article exactly as it did.
  readonly describeFigures?: boolean | undefined;
  // With describing on, leave code blocks out of the narration rather than summarising them.
  // Stored only when on.
  readonly skipCode?: boolean | undefined;
}

// One shared pronunciation, copied into a project from another project's glossary.
export interface SharedPronunciation {
  readonly term: string;
  readonly ipa: readonly string[];
}

export interface ImagePromptChoice {
  readonly name: string;
  // 1-20 per ticked prompt, 60 across the run.
  readonly number: number;
}

export interface EntryChoice {
  readonly name: string;
  // The mode decides whether the run needs the LLM row. The request carries it so
  // Play can show the row live, but edge/http/projects.ts replaces it with the saved
  // entry's mode before this rule set sees the draft.
  readonly mode: EntryMode;
}

// Text a stage set to Provide carries instead of a file.
export interface ProvidedText {
  readonly research?: string | undefined;
  readonly article?: string | undefined;
}

// Ids of files already in staging, in slideshow order for images.
export interface ProvidedFiles {
  readonly audio?: string | undefined;
  readonly images?: readonly string[] | undefined;
  readonly thumbnail?: string | undefined;
  // The establishing image, when `reference.source` is "provide".
  readonly reference?: string | undefined;
  // The Shorts step's background music, staged like narration audio. Copied into the project
  // as the revision's `shortsMusic` when the run starts; ignored while Shorts is off.
  readonly shortsMusic?: string | undefined;
  // The ambient bed's own file, when `ambientBed.source` is "upload". Copied into the project
  // as the revision's `ambientBed` when the run starts.
  readonly ambientBed?: string | undefined;
}

// How many thumbnails a generated thumbnail step makes. Three gives two more drawn from the
// same prompt with other compositions, for YouTube's Test & Compare. Absent reads as one,
// which is what every project saved before it was.
export const thumbnailCounts = [1, 3] as const;
export type ThumbnailCount = (typeof thumbnailCounts)[number];
// The work key of each thumbnail: the first keeps the key every thumbnail always had.
export function thumbnailKey(variant: number): string {
  return variant <= 1 ? "thumbnail:image" : `thumbnail:image:${String(variant)}`;
}
// Which thumbnail (1-3) a work key is, or undefined for any other key.
export function thumbnailVariant(key: string): number | undefined {
  if (key === "thumbnail:image") return 1;
  const match = /^thumbnail:image:([23])$/.exec(key);
  return match === null ? undefined : Number(match[1]);
}
// How many thumbnails the run makes: three only when asked for and the image provider draws
// them; an uploaded thumbnail is always one.
export function thumbnailCountOf(
  draft: Pick<RunDraft, "sources" | "thumbnailCount">,
): ThumbnailCount {
  return draft.thumbnailCount === 3 &&
    (draft.sources.thumbnail === "from_prompt" || draft.sources.thumbnail === "prompt_by_llm")
    ? 3
    : 1;
}

// The Images stage's establishing image: made first (from a library image prompt) or uploaded,
// then every other image of the run - the video's, the shorts' and, unless `thumbnail` is
// false, the thumbnail - is drawn with it as a visual reference for characters, style and
// palette. It is never shown in the video. Absent is Off, which is what every project saved
// before it existed was.
export const referenceSources = ["prompt", "provide"] as const;
// The work key of the establishing image's step, in the Images stage.
export const referenceKey = "reference:image";
export type ReferenceSource = (typeof referenceSources)[number];
export interface ReferenceSettings {
  readonly source: ReferenceSource;
  // The image prompt's name in the library, when `source` is "prompt".
  readonly prompt?: string | undefined;
  // Whether the thumbnail is drawn with it too. Absent reads as on.
  readonly thumbnail?: boolean | undefined;
}

// What a run makes: the long video (absent, which is what every project saved before the
// mode existed was) or one vertical short of about a minute, made by the same stages with
// the Shorts renderer's word-by-word captions (`admission/short-mode.ts`).
export const runModes = ["video", "short"] as const;
export type RunMode = (typeof runModes)[number];

// What Play posts. Everything a run is configured with, before any rule has looked at it.
export interface RunDraft {
  readonly mode?: RunMode | undefined;
  // The other projects' pronunciations as copied when this one started or was last refreshed
  // in Edit project; used only while `audio.shareGlossary` is on.
  readonly sharedGlossary?: readonly SharedPronunciation[] | undefined;
  // Library → Aliases as copied when this project started or was last refreshed in Edit
  // project; used only while `audio.useNarrationAliases` is on. Absent when none were copied.
  readonly narrationAliases?: readonly NarrationAlias[] | undefined;
  readonly checkpoints?: readonly import("../checkpoints/model.js").CheckpointStage[] | undefined;
  readonly title: string;
  readonly format: Format;
  readonly sources: StageSources;
  readonly llm?: ProviderChoice | undefined;
  readonly audio?: VoiceChoice | undefined;
  readonly images?: ProviderChoice | undefined;
  // The establishing image (`ReferenceSettings`); used only while images are Generate.
  readonly reference?: ReferenceSettings | undefined;
  readonly articlePrompt?: string | undefined;
  readonly narrationPrompt?: string | undefined;
  readonly imagePrompts: readonly ImagePromptChoice[];
  // More images for long videos: images per hour of narration and the length they are
  // planned for (`images/scale.ts`); the prompts' Numbers stay the floor. Absent is each
  // prompt's Number exactly, which is what every project saved before it made.
  readonly imageScale?: import("../images/scale.js").ImageScale | undefined;
  readonly thumbnailPrompt?: string | undefined;
  // `thumbnailCountOf` reads it; absent is one thumbnail.
  readonly thumbnailCount?: ThumbnailCount | undefined;
  readonly intro?: EntryChoice | undefined;
  readonly outro?: EntryChoice | undefined;
  readonly values: Readonly<Record<string, string>>;
  readonly provided: ProvidedText & ProvidedFiles;
  // How the narration source is cut into TTS requests, chosen per run on
  // Play's audio block. Optional here because Play's control is not built yet; the
  // narration slice falls back to `defaultChunking` and a run made before the control
  // existed keeps working.
  readonly chunking?: Chunking | undefined;
  readonly silenceGapSeconds: number;
  // How long each slideshow image stays on screen before the next; the images cycle until
  // the video ends. A config saved before this existed reads as 15 (`schema.ts`).
  readonly imageSeconds: number;
  // How far each slot zooms, in percent of the frame: 22.5 is 100% → 122.5%, 0 keeps the
  // stills still. A config saved before this existed reads as 22.5.
  readonly zoomPercent: number;
  // How each image moves. A config saved before this existed reads as "zoom", which is
  // what every video did then.
  readonly motionStyle: MotionStyle;
  // Silence before the first and after the last narration segment of both exports. A
  // config saved before this existed reads as 2.
  readonly edgeSilenceSeconds: number;
  readonly subtitles?: SubtitleConfig | undefined;
  // The PDF's look. Absent on configs saved before the Document stage.
  readonly document?: DocumentSettings | undefined;
  // "Show tables and figures on screen": every block the narration describes is also drawn as
  // a card the video shows while it is described (`video/figure-card.ts`). Stored only when
  // on; absent reads as off, which is what every project saved before it was.
  readonly showFigures?: boolean | undefined;
  // The Video stage's optional YouTube description step (`slices/youtube`). Absent reads as
  // off, which is what every project saved before it was.
  readonly youtubeDescription?: boolean | undefined;
  // The Description prompt from the library; absent or blank uses the built-in one.
  readonly descriptionPrompt?: string | undefined;
  // The Video stage's optional Shorts step (`slices/shorts`). Absent reads as off, which is
  // what every project saved before it was.
  readonly shorts?: import("../shorts/model.js").ShortsSettings | undefined;
  // How the video is cut, joined and finished: cuts, transitions, the Look and animated images
  // (`video/edit-settings.ts`). Absent reads as today's slideshow, which is what every project
  // saved before it rendered.
  readonly videoEdit?: import("../video/edit-settings.js").VideoEditSettings | undefined;
  // Automatic reviews per stage (`slices/reviews`). Absent reads as every review Off, which is
  // what every project saved before them was.
  readonly reviews?: import("../reviews/model.js").ReviewSettings | undefined;
  // The channel the run was started in (`slices/channels`). Absent on everything saved before
  // channels, which reads as the default channel.
  readonly channelId?: string | undefined;
  // "Use the channel's brand kit" (Play's Channel row, Edit project's Channel). Saved only when
  // off; absent reads as on, which is what every project saved before it was.
  readonly useBrandKit?: false | undefined;
  // The channel's cast as the run was started with it: an image whose brief mentions a member
  // is drawn with that member's pictures as references (`recipe-cast.ts`). Absent is none.
  readonly cast?: readonly import("../channels/model.js").CastSnapshot[] | undefined;
  // Episode memory: the summaries of the channel's related earlier episodes as the run was
  // started, appended to the article (or script) prompt (`slices/episodes/related.ts`). Absent
  // is none, which is what every project made before episode memory, or with it off, has.
  readonly earlierEpisodes?: readonly import("../episodes/repo.js").EarlierEpisode[] | undefined;
  // The chapter cards' and end screen's font and colour, from the channel's brand kit. Absent
  // is the caption font in white, as every video before it.
  readonly titleStyle?: TitleStyle | undefined;
  // A card over the video's last seconds, from the brand kit. Absent is none.
  readonly endScreen?: { readonly text: string } | undefined;
  // Multiple voices: an audiobook, podcast, radio drama or interview narrated by several
  // speakers from a script (`slices/voices`). Absent is the Narration format, one voice
  // reading the article, which is what every project saved before it was.
  readonly voices?: import("../voices/model.js").VoicesSettings | undefined;
  // Rain, fire, wind or the user's own file under the long video's narration, ducked under the
  // voice (`video/ambient-bed.ts`), from the template or the channel's brand kit. Absent is
  // none, which is what every project saved before it was.
  readonly ambientBed?: import("../video/ambient-bed.js").AmbientBedSettings | undefined;
  // Level the volume: every narration piece brought to one loudness before the join, and the
  // finished files mastered to these targets (`loudness/model.ts`). Absent is off, which is what
  // every project saved before it was; a new run gets Settings → General's default.
  readonly loudness?: import("../loudness/model.js").LoudnessSettings | undefined;
  // Pauses between sentences and between paragraphs, the minimum quiet in seconds the narration
  // join makes there (`narration/pauses-model.ts`). Absent (or 0) is no minimum, which is what
  // every project saved before them was; a new run gets the sentence default.
  readonly sentencePauseSeconds?: number | undefined;
  readonly paragraphPauseSeconds?: number | undefined;
  // The language the project is made in (`kernel/ports/languages.ts`). Absent is English, which is
  // what every project saved before it was; English is never stored.
  readonly language?: import("../../kernel/ports/languages.js").LanguageCode | undefined;
}

export interface TitleStyle {
  readonly fontId?: string | undefined;
  // #RRGGBB.
  readonly color?: string | undefined;
}

// The draft as accepted, coerced and trimmed. This is what the project's `config` column
// holds.
export interface RunConfig extends RunDraft {
  readonly rendered: Readonly<Record<string, string>>;
}

export interface Project {
  readonly id: string;
  readonly title: string;
  readonly format: Format;
  readonly config: RunConfig;
  readonly createdAt: string;
  readonly updatedAt: string;
  // Optional on old in-memory fixtures; repository reads always expose a boolean.
  readonly paused?: boolean;
}

export interface Stage {
  readonly id: string;
  readonly projectId: string;
  readonly kind: StageKind;
  readonly source: StageSource;
  readonly state: StageState;
  readonly failureReason: string | null;
  readonly attemptCount: number;
  readonly progressCurrent: number | null;
  readonly progressTotal: number | null;
  readonly startedAt: string | null;
  readonly finishedAt: string | null;
  // The provider error's kind behind `failureReason`, which picks the fix-it button.
  readonly failureKind?: string;
  // Waiting to run again by itself after a failure time can fix (a rate limit, a timeout).
  readonly retryAt?: string;
  // A running step's time left (`slices/eta`), as the server saw it when it answered: seconds
  // and what they rest on. The page recomputes it every second from `typicalSeconds`, how
  // long such a step usually takes in all, when finished runs give one.
  readonly etaSeconds?: number;
  readonly etaBasis?: import("../eta/model.js").EtaBasis;
  readonly typicalSeconds?: number;
}

export interface ProjectSummary extends Project {
  readonly status: ProjectState;
}

// One row of 07 Projects. The list carries a share rather than the stage rows a project
// page reads: the screen shows one thin meter per running row and nothing else of a
// stage, so sending six stage rows per project to average them in the browser would be
// six times the body for the same 2 px.
export interface ProjectListing extends ProjectSummary {
  // 0 to 1, averaged over the stages the run asked for (`kernel/runner/graph.ts`).
  readonly progress: number;
  // The channel the project belongs to (`project_channels`), the default one when unset, so
  // Home, the calendar and this list can show one channel at a time.
  readonly channelId: string;
  // When the person marked the finished video as uploaded (Home, Ready to upload); null
  // while it is not.
  readonly uploadedAt: string | null;
  // Stages waiting for a CLI plan's limits to reset (`slices/run-cost/limits.ts`), so the
  // row can say "Waiting for Codex limits (resets at 14:00)". Left out when nothing waits.
  readonly limitWaits?: readonly ListingLimitWait[];
}

export interface ListingLimitWait {
  // "Codex", "Claude".
  readonly name: string;
  readonly stage: StageKind;
  readonly resetsAt: string | null;
  // When the wait checks again; what the row says when the CLI named no reset time.
  readonly retryAt: string;
}
