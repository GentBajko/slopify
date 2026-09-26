import type { Format, ProjectState, StageKind, StageState } from "../../kernel/pipeline.js";
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
}

// What Play posts. Everything a run is configured with, before any rule has looked at it.
export interface RunDraft {
  // The other projects' pronunciations as copied when this one started or was last refreshed
  // in Edit project; used only while `audio.shareGlossary` is on.
  readonly sharedGlossary?: readonly SharedPronunciation[] | undefined;
  readonly checkpoints?: readonly import("../checkpoints/model.js").CheckpointStage[] | undefined;
  readonly title: string;
  readonly format: Format;
  readonly sources: StageSources;
  readonly llm?: ProviderChoice | undefined;
  readonly audio?: VoiceChoice | undefined;
  readonly images?: ProviderChoice | undefined;
  readonly articlePrompt?: string | undefined;
  readonly narrationPrompt?: string | undefined;
  readonly imagePrompts: readonly ImagePromptChoice[];
  readonly thumbnailPrompt?: string | undefined;
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
  // The Video stage's optional YouTube description step (`slices/youtube`). Absent reads as
  // off, which is what every project saved before it was.
  readonly youtubeDescription?: boolean | undefined;
  // The Description prompt from the library; absent or blank uses the built-in one.
  readonly descriptionPrompt?: string | undefined;
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
}
