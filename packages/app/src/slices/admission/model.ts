import type { Format, ProjectState, StageKind, StageState } from "../../kernel/pipeline.js";

export type { Format } from "../../kernel/pipeline.js";
// The format is the kernel's: the image port asks for the same two aspects.
export { formats } from "../../kernel/pipeline.js";

// mockup §Q28 and logic/10 §Q78: Generate / Provide / Off for most stages, and the
// thumbnail's two Generate modes. Video is always `generate` (logic/01 step 5).
export const stageSources = ["generate", "provide", "off", "from_prompt", "prompt_by_llm"] as const;
export type StageSource = (typeof stageSources)[number];

export const entryModes = ["text", "llm"] as const;
export type EntryMode = (typeof entryModes)[number];

export interface ProviderChoice {
  readonly provider: string;
  readonly model: string;
}

export interface VoiceChoice extends ProviderChoice {
  readonly voice: string;
}

export interface ImagePromptChoice {
  readonly name: string;
  // logic/04 §Q30: 1-20 per ticked prompt, 60 across the run.
  readonly number: number;
}

export interface EntryChoice {
  readonly name: string;
  // The mode decides whether the run needs the LLM row (§Q97). ceiling: it arrives on the
  // request until the library slice can look the saved entry up by name.
  readonly mode: EntryMode;
}

// Text a stage set to Provide carries instead of a file (logic/05 §Q37).
export interface ProvidedText {
  readonly research?: string | undefined;
  readonly article?: string | undefined;
}

// Ids of files already in staging, in slideshow order for images (logic/05 §Q39).
export interface ProvidedFiles {
  readonly audio?: string | undefined;
  readonly images?: readonly string[] | undefined;
  readonly thumbnail?: string | undefined;
}

// What Play posts. Everything a run is configured with, before any rule has looked at it.
export interface RunDraft {
  readonly title: string;
  readonly format: Format;
  readonly sources: Readonly<Record<StageKind, StageSource>>;
  readonly llm?: ProviderChoice | undefined;
  readonly audio?: VoiceChoice | undefined;
  readonly images?: ProviderChoice | undefined;
  readonly articlePrompt?: string | undefined;
  readonly imagePrompts: readonly ImagePromptChoice[];
  readonly thumbnailPrompt?: string | undefined;
  readonly intro?: EntryChoice | undefined;
  readonly outro?: EntryChoice | undefined;
  readonly values: Readonly<Record<string, string>>;
  readonly provided: ProvidedText & ProvidedFiles;
  readonly silenceGapSeconds: number;
}

// The draft as accepted, with the coercions logic/05 §Q41 requires and the values
// trimmed per logic/03 step 4. This is what the project's `config` column holds.
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
