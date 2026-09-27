import { languageInfo } from "@app/kernel/ports/languages.js";
import type { FieldError } from "@app/slices/admission/rules.js";
import { documentThemeLabel } from "@app/slices/document/model.js";
import type { ProviderStatus, Voice } from "@app/slices/settings/model.js";
import { cutModeLabels, videoEditOf } from "@app/slices/video/edit-settings.js";
import { voiceFormatLabels } from "@app/slices/voices/model.js";
import type { PlaySection } from "./sections";
import { type PlayFormState, shortsOn, sourceLabels } from "./state";

// Play is one path: template, topic, Start. Everything else is folded into these rows, each
// a one-line summary with Change opening its editor in place (Reviews opens the side panel).
export const setupRows = [
  { id: "title", label: "Title and keywords", section: "content" },
  { id: "article", label: "Article", section: "content" },
  { id: "narration", label: "Narration", section: "outputs" },
  { id: "images", label: "Images", section: "outputs" },
  { id: "video", label: "Video and style", section: "style" },
  { id: "outputs", label: "Outputs", section: "outputs" },
  { id: "reviews", label: "Reviews", section: "review" },
  { id: "channel", label: "Channel", section: "content" },
] as const satisfies readonly {
  readonly id: string;
  readonly label: string;
  readonly section: PlaySection;
}[];
export type SetupRowId = (typeof setupRows)[number]["id"];

// Which row holds a field, by the dotted names `admit` and the refusals use. The rows are
// matched in order, so the longer prefixes come first.
const owners: readonly (readonly [SetupRowId, readonly string[]])[] = [
  ["title", ["title", "values"]],
  [
    "article",
    [
      "sources.article",
      "sources.research",
      "articlePrompt",
      "provided.article",
      "provided.research",
      "llm",
    ],
  ],
  [
    "narration",
    [
      "sources.audio",
      "audio",
      "voices",
      "provided.audio",
      "narrationPrompt",
      "intro",
      "outro",
      "chunking",
    ],
  ],
  [
    "images",
    [
      "sources.images",
      "images",
      "imagePrompts",
      "provided.images",
      "reference",
      "provided.reference",
    ],
  ],
  [
    "video",
    [
      "sources.video",
      "imageSeconds",
      "zoomPercent",
      "motionStyle",
      "edgeSilenceSeconds",
      "silenceGapSeconds",
      "sentencePauseSeconds",
      "paragraphPauseSeconds",
      "loudness",
      "videoEdit",
      "format",
      "subtitles",
      "fontUpload",
    ],
  ],
  [
    "outputs",
    [
      "sources.thumbnail",
      "thumbnailPrompt",
      "provided.thumbnail",
      "thumbnailCount",
      "youtubeDescription",
      "descriptionPrompt",
      "shorts",
      "sources.document",
      "document",
    ],
  ],
  ["reviews", ["checkpoints", "reviews"]],
  ["channel", ["channelId", "useBrandKit", "language"]],
];

const owns = (prefixes: readonly string[], field: string): boolean =>
  prefixes.some((prefix) => field === prefix || field.startsWith(`${prefix}.`));

export function rowOf(field: string): SetupRowId | undefined {
  return owners.find(([, prefixes]) => owns(prefixes, field))?.[0];
}

// The rows a section opens when nothing more precise is asked for: what the Content, Outputs
// and Style tabs held before Play had rows (a saved draft remembers its section).
export function rowsOfSection(section: PlaySection): readonly SetupRowId[] {
  switch (section) {
    case "content":
      return ["title", "article", "channel"];
    case "outputs":
      return ["narration", "images", "video", "outputs"];
    case "style":
      return ["video"];
    case "review":
      return ["reviews"];
  }
}

// The first refusal a row holds, so the row can say it needs attention. Topic keywords are
// typed at the top of Play, so their refusals are not the Title row's to show.
export function rowProblem(
  row: SetupRowId,
  errors: readonly FieldError[],
  topics: readonly string[],
): FieldError | undefined {
  return errors.find((error) => {
    if (rowOf(error.field) !== row) return false;
    if (row !== "title") return true;
    if (error.field === "title") return topics.length > 0;
    return !topics.some((topic) => error.field === `values.${topic}`);
  });
}

export interface SummaryContext {
  readonly providers: readonly ProviderStatus[];
  readonly voices: readonly Voice[];
  readonly keywords: number;
  readonly topics: readonly string[];
  readonly channel: string | undefined;
  readonly brandKit: boolean;
  readonly look: string;
  readonly fontName: string | undefined;
  readonly checkpoints: number;
  readonly reviews: number;
}

// Each row's one line: what the run will do, in the order a person would say it.
export function rowSummary(row: SetupRowId, form: PlayFormState, context: SummaryContext): string {
  const provider = (id: string): string =>
    id === "" ? "no provider" : (context.providers.find((one) => one.id === id)?.displayName ?? id);
  const join = (parts: readonly (string | boolean | undefined)[]): string =>
    parts.filter((part): part is string => typeof part === "string" && part !== "").join(" · ");
  switch (row) {
    case "title":
      return join([
        context.topics.length ? form.title : false,
        context.keywords === 0
          ? "No keywords"
          : `${String(context.keywords)} keyword${context.keywords === 1 ? "" : "s"}`,
      ]);
    case "article":
      return form.sources.article === "provide"
        ? "Your article"
        : join([
            form.articlePrompt || "No prompt picked",
            form.llm.provider
              ? `${provider(form.llm.provider)} · ${form.llm.model || "no model"}`
              : false,
            form.sources.research === "off"
              ? "research off"
              : `research: ${sourceLabels[form.sources.research].toLowerCase()}`,
          ]);
    case "narration": {
      if (form.sources.audio === "off") return "Off, a silent video";
      if (form.sources.audio === "provide")
        return form.provided.audio?.name ?? "Your narration file";
      const voice = context.voices.find(
        (one) => one.provider === form.audio.provider && one.voiceId === form.audio.voice,
      );
      return join([
        provider(form.audio.provider),
        form.voices === undefined
          ? (voice?.name ?? (form.audio.voice || "no voice"))
          : `${voiceFormatLabels[form.voices.format]}, ${String(form.voices.speakers.length)} speakers`,
        form.narrationPrompt ? `prepared with ${form.narrationPrompt}` : false,
        form.intro ? `intro ${form.intro}` : false,
        form.outro ? `outro ${form.outro}` : false,
      ]);
    }
    case "images": {
      if (form.sources.images === "off") return "Off";
      if (form.sources.images === "provide")
        return `${String(form.provided.images.length)} of your images`;
      const prompts = form.imagePrompts.map((one) => `${one.name} × ${one.number || "?"}`);
      return join([
        prompts.length ? prompts.join(", ") : "No image prompts picked",
        provider(form.images.provider),
        form.images.model,
        form.reference !== undefined && form.reference.source !== "off"
          ? "establishing image"
          : false,
      ]);
    }
    case "video":
      return join([
        form.format,
        form.sources.video === "off"
          ? "no video"
          : cutModeLabels[videoEditOf(form).cuts].toLowerCase(),
        form.sources.video === "off" ? false : context.look,
        form.sources.audio !== "off" && form.subtitles.mode !== "off"
          ? `captions ${context.fontName ?? form.subtitles.fontId} ${form.subtitles.fontSize} ${form.subtitles.position}`
          : "no captions",
      ]);
    case "outputs": {
      const thumbnails =
        form.sources.thumbnail === "off"
          ? false
          : form.sources.thumbnail === "provide"
            ? "your thumbnail"
            : form.thumbnailCount === 3
              ? "3 thumbnails"
              : "1 thumbnail";
      const parts = [
        thumbnails,
        shortsOn(form) && form.shorts ? `${form.shorts.count} shorts` : false,
        form.youtubeDescription === true && form.sources.audio !== "off"
          ? "YouTube description"
          : false,
        form.sources.document === "generate" ? `PDF (${documentThemeLabel(form.document)})` : false,
      ];
      return join(parts) || "Only the video";
    }
    case "reviews":
      return join([
        context.checkpoints === 0
          ? "No checkpoints"
          : `${String(context.checkpoints)} checkpoint${context.checkpoints === 1 ? "" : "s"}`,
        context.reviews === 0
          ? "no automatic reviews"
          : `${String(context.reviews)} automatic review${context.reviews === 1 ? "" : "s"}`,
      ]);
    case "channel":
      return join([
        context.channel ?? "Default channel",
        context.brandKit ? "brand kit on" : "brand kit off",
        // Only a language picked here; otherwise the channel's (or English) applies.
        form.language === undefined ? undefined : languageInfo(form.language).name,
      ]);
  }
}
