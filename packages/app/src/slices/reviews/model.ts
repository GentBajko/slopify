// Automatic reviews: a reviewer model looks at each finished item of a stage (the article,
// every image, the narration, the thumbnail, every short) before the run moves on, and says
// pass or fail with its reasons. A failed item is flagged, or made again while its retries
// last. Browser-safe: Play, Edit project and the project page read these names and limits too.

import type { ThinkingMode } from "../../kernel/ports/llm.js";

export const reviewStages = ["article", "images", "narration", "thumbnail", "shorts"] as const;
export type ReviewStage = (typeof reviewStages)[number];

// Off is the same as the stage having no entry, which is what every project saved before
// reviews existed has.
export const reviewModes = ["off", "flag", "redo"] as const;
export type ReviewMode = (typeof reviewModes)[number];

export interface ReviewStageSettings {
  readonly mode: ReviewMode;
  // A Review prompt from the library; absent or blank uses the stage's built-in one.
  readonly prompt?: string | undefined;
}

export interface ReviewSettings {
  // The reviewer: a text model that can look at images for the image stages.
  readonly provider: string;
  readonly model: string;
  readonly thinking?: ThinkingMode | undefined;
  // How many times one item is made again after a failed review before it is kept and
  // flagged. Absent is `defaultReviewRetries`.
  readonly retries?: number | undefined;
  readonly stages: Readonly<Partial<Record<ReviewStage, ReviewStageSettings>>>;
}

// ceiling: the owner's numbers. Two redos is what a person would try before looking at it
// themselves; five is already six paid images for one slot.
export const defaultReviewRetries = 2;
export const reviewRetriesMin = 0;
export const reviewRetriesMax = 5;

export const reviewStageLabels: Readonly<Record<ReviewStage, string>> = {
  article: "Article",
  images: "Images",
  narration: "Narration",
  thumbnail: "Thumbnail",
  shorts: "Shorts",
};

export const reviewModeLabels: Readonly<Record<ReviewMode, string>> = {
  off: "Off",
  flag: "Flag only",
  redo: "Flag and redo",
};

// The stages whose items are pictures, so the reviewer has to be shown them.
export const visionStages: readonly ReviewStage[] = ["images", "thumbnail", "shorts"];

// The text providers whose adapter hands the model image files (`capabilities.images` in
// `adapters/llm`): Claude Code reads them with its Read tool in a private folder, Codex
// attaches them with `--image`. The Gemini CLI and OpenRouter adapters send text only.
export const imageReviewers: readonly string[] = ["claude-code", "codex"];

export function reviewModeOf(settings: ReviewSettings | undefined, stage: ReviewStage): ReviewMode {
  return settings?.stages[stage]?.mode ?? "off";
}

export function reviewRetriesOf(settings: ReviewSettings | undefined): number {
  return settings?.retries ?? defaultReviewRetries;
}

export function reviewedStages(settings: ReviewSettings | undefined): readonly ReviewStage[] {
  return reviewStages.filter((stage) => reviewModeOf(settings, stage) !== "off");
}

// The key a stage's picked Review prompt renders under in `config.rendered`.
export function reviewPromptKey(stage: ReviewStage): string {
  return `review.${stage}`;
}

// A review's step is `review:` and the key of the item it reviews. The narration is
// reviewed as a whole, so its item key names no step.
export const narrationItemKey = "narration";
export function reviewKey(itemKey: string): string {
  return `review:${itemKey}`;
}
export function reviewedItemKey(key: string): string | undefined {
  return key.startsWith("review:") ? key.slice("review:".length) : undefined;
}

// The settings as Play and templates keep them: the retries as typed text, and a stage's
// prompt as a Review prompt's name ("" is the built-in one).
export interface ReviewSettingsForm {
  readonly provider: string;
  readonly model: string;
  readonly thinking?: ThinkingMode | undefined;
  readonly retries: string;
  readonly stages: Readonly<
    Partial<Record<ReviewStage, { readonly mode: ReviewMode; readonly prompt: string }>>
  >;
}

export function reviewSettingsForm(settings: ReviewSettings): ReviewSettingsForm {
  return {
    provider: settings.provider,
    model: settings.model,
    ...(settings.thinking === undefined ? {} : { thinking: settings.thinking }),
    retries: settings.retries === undefined ? "" : String(settings.retries),
    stages: Object.fromEntries(
      reviewStages.flatMap((stage) => {
        const picked = settings.stages[stage];
        return picked === undefined
          ? []
          : [[stage, { mode: picked.mode, prompt: picked.prompt ?? "" }]];
      }),
    ),
  };
}

export type ReviewOutcome = "passed" | "flagged" | "redo";

export interface ReviewVerdict {
  readonly passed: boolean;
  readonly reasons: readonly string[];
}

// One saved verdict, as the project page shows it.
export interface ReviewRecord extends ReviewVerdict {
  readonly id: string;
  readonly projectId: string;
  readonly revisionId: string;
  readonly itemKey: string;
  readonly stage: ReviewStage;
  // The reviewed output's fingerprint: a verdict is about that exact file.
  readonly itemFingerprint: string;
  readonly reviewFingerprint: string;
  readonly outcome: ReviewOutcome;
  readonly attempt: number;
  // What the person did about it: accepted it anyway, or had it made again.
  readonly action: "overruled" | "redone" | null;
  readonly actionAt: string | null;
  // An automatic redo: waiting to start, started, or refused (with the reason).
  readonly redoState: "pending" | "started" | "failed" | null;
  readonly redoError: string | null;
  readonly createdAt: string;
}

export const defaultReviewPrompts: Readonly<Record<ReviewStage, string>> = {
  article:
    "Review this article against the article prompt it was written from. Fail it when it breaks the prompt's rules on length, structure or tone; when it states names, places, events or facts that neither the prompt nor the research notes support (invented lore); or when a section repeats another section's content. Small style preferences are not a reason to fail it.",
  images:
    "Review this image against the brief it was drawn from. Fail it when a hand or body is malformed (extra or missing fingers, fused limbs, broken anatomy); when it shows stray text, letters, captions or watermarks the brief did not ask for; when it does not show what the brief asks for; or, when an establishing image is attached, when it does not match it (a different character, palette or style).",
  narration:
    "Review this narration against the text it was read from. The transcript was heard back from the audio; the gaps list stretches of text the timing could not hear. Fail it when words, sentences or passages are missing or garbled in a way a listener would notice. Ignore punctuation, numbers written out, and small differences in how words were transcribed.",
  thumbnail:
    "Review this thumbnail as it would be seen on a phone, about 320 pixels wide. Fail it when its text (if any) cannot be read at that size, when the subject is unclear or cluttered, when a hand or body is malformed, or when it shows stray letters or watermarks.",
  shorts:
    "Review these images from one vertical short, as they would be seen full screen on a phone. Fail them when the subject is unclear, when a hand or body is malformed, when they show stray text, letters or watermarks, or when they do not fit the short's title.",
};
