import { languageInfo } from "@app/kernel/ports/languages.js";
import { render } from "@app/slices/admission/substitute.js";
import { documentThemeLabel } from "@app/slices/document/model.js";
import {
  channelName,
  extrasName,
  setupSectionNames,
} from "@app/slices/project-templates/setup-sections.js";
import type { ProviderStatus, Voice } from "@app/slices/settings/model.js";
import {
  atmosphereLabels,
  colorGradeLabels,
  transitionLabels,
  usesNarrationCuts,
  type VideoEditSettings,
  videoEditOf,
} from "@app/slices/video/edit-settings.js";
import { voiceFormatLabels } from "@app/slices/voices/model.js";
import { pauseLabel } from "./checkpoints";
import { imageServiceUsers, listed } from "./image-needs";
import type { OutputKind } from "./output-kind";
import type { PlaySection } from "./sections";
import { type PlayFormState, shortsOn } from "./state";

// Create is one screen: what is being made, the topic, then these rows, each one plain sentence
// saying what the run will do, with Change opening its editor in place under it (one at a time).
// The same names, in the same order, as Edit template and a project's Edit settings: the one
// list in `setup-sections.ts`, with the optional outputs together under Extras.
export const setupRows = [
  { id: "title", label: setupSectionNames.topic, section: "content" },
  { id: "article", label: setupSectionNames.article, section: "content" },
  { id: "narration", label: setupSectionNames.narration, section: "outputs" },
  { id: "images", label: setupSectionNames.images, section: "outputs" },
  { id: "video", label: setupSectionNames.video, section: "style" },
  { id: "outputs", label: extrasName, section: "outputs" },
  { id: "reviews", label: setupSectionNames.checks, section: "review" },
  { id: "channel", label: channelName, section: "content" },
] as const satisfies readonly {
  readonly id: string;
  readonly label: string;
  readonly section: PlaySection;
}[];
export type SetupRowId = (typeof setupRows)[number]["id"];

// A row's name for what is being made: the Video and style row of spoken work holds its
// captions and sound, and of a set of images only their shape and look.
export function rowLabel(row: SetupRowId, kind: OutputKind = "video"): string {
  if (row === "video" && (kind === "audiobook" || kind === "podcast")) return "Sound and captions";
  if (row === "video" && kind === "images") return "Shape and look";
  return setupRows.find((one) => one.id === row)?.label ?? row;
}

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
      "language",
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
      "removeBreaths",
      "deEss",
      "levelSentences",
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
  ["channel", ["channelId", "useBrandKit"]],
];

// The dotted fields a row holds, for comparing a draft with the template it came from.
export function rowFields(row: SetupRowId): readonly string[] {
  return owners.find(([id]) => id === row)?.[1] ?? [];
}

const owns = (prefixes: readonly string[], field: string): boolean =>
  prefixes.some((prefix) => field === prefix || field.startsWith(`${prefix}.`));

// `llmRow` is the row the text model sits in (`llmUsesOf`): its refusal is that row's.
export function rowOf(field: string, llmRow: SetupRowId = "article"): SetupRowId | undefined {
  if (owns(["llm"], field)) return llmRow;
  return owners.find(([, prefixes]) => owns(prefixes, field))?.[0];
}

// The rows a section opens when nothing more precise is asked for (the guided tour): what the
// Content, Outputs and Style tabs held before Create had rows.
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

export interface SummaryContext {
  readonly providers: readonly ProviderStatus[];
  readonly voices: readonly Voice[];
  // The keywords the picked prompts and the title ask for, and which of them are topics.
  readonly keywords: readonly string[];
  readonly topics: readonly string[];
  readonly channel: string | undefined;
  readonly brandKit: boolean;
  readonly fontName: string | undefined;
  readonly reviews: number;
  // What the person is making; absent reads as a video, as every draft did before the choice.
  readonly kind?: OutputKind | undefined;
  // A model's name as its service lists it, when that list has arrived.
  readonly modelName?: ((provider: string, model: string) => string | undefined) | undefined;
}

const shapes: Readonly<Record<string, string>> = {
  "16:9": "Landscape 16:9",
  "9:16": "Portrait 9:16",
  "1:1": "Square 1:1",
};

const article = (word: string): string => (/^[aeiou]/i.test(word) ? "an" : "a");

// Each row's one sentence: what the run will do, in the person's words and the services'
// own names. Defaults read as defaults; nothing is a raw setting or id.
export function rowSummary(row: SetupRowId, form: PlayFormState, context: SummaryContext): string {
  const kind = context.kind ?? "video";
  const service = (id: string): string | undefined =>
    id === "" ? undefined : (context.providers.find((one) => one.id === id)?.displayName ?? id);
  const model = (provider: string, id: string): string | undefined =>
    id === "" ? undefined : (context.modelName?.(provider, id) ?? id);
  const by = (choice: {
    readonly provider: string;
    readonly model: string;
  }): string | undefined => {
    const name = service(choice.provider);
    if (name === undefined) return undefined;
    const picked = model(choice.provider, choice.model);
    return picked === undefined ? name : `${name} (${picked})`;
  };
  switch (row) {
    case "title": {
      const asks = context.keywords.filter((name) => !context.topics.includes(name));
      const blanks = Object.fromEntries(context.topics.map((name) => [name, "…"]));
      const pattern = /^\s*\{\{[^{}]+\}\}\s*$/.test(form.title)
        ? undefined
        : render(form.title, { ...blanks, ...nonEmpty(form.values) });
      return (
        [
          context.topics.length > 0 && pattern !== undefined ? `Title: “${pattern}”.` : undefined,
          asks.length > 0 ? `Asks for: ${asks.join(", ")}.` : undefined,
        ]
          .filter((part) => part !== undefined)
          .join(" ") || "Nothing to fill in."
      );
    }
    case "article": {
      if (form.sources.article === "off") return "No article.";
      const language =
        form.language === undefined ? "" : ` In ${languageInfo(form.language).name}.`;
      if (form.sources.article === "provide") return `Your own text, used as written.${language}`;
      const writer = by(form.llm);
      const prompt = form.articlePrompt === "" ? undefined : `the “${form.articlePrompt}” prompt`;
      const research =
        form.sources.research === "generate"
          ? ", with web research"
          : form.sources.research === "provide"
            ? ", from your notes"
            : "";
      const missing = [
        prompt === undefined ? "No article prompt picked yet." : undefined,
        writer === undefined ? "No writing service picked yet." : undefined,
      ].filter((part) => part !== undefined);
      const made =
        writer !== undefined && prompt !== undefined
          ? `Written by ${writer} from ${prompt}${research}.`
          : writer !== undefined
            ? `Written by ${writer}${research}.`
            : prompt !== undefined
              ? `Written from ${prompt}${research}.`
              : "";
      return [made, ...missing].filter((part) => part !== "").join(" ") + language;
    }
    case "narration": {
      if (form.sources.audio === "off") return kind === "video" ? "None: a silent video." : "None.";
      if (form.sources.audio === "provide")
        return form.provided.audio === undefined
          ? "Your own recording, not attached yet."
          : `Your own recording: ${form.provided.audio.name}.`;
      const extras = [
        form.intro ? `the “${form.intro}” intro` : undefined,
        form.outro ? `the “${form.outro}” outro` : undefined,
      ].filter((part) => part !== undefined);
      const after = extras.length > 0 ? `, with ${listed(extras)}` : "";
      // Several speakers with no intro or outro are read by their own voices' services only.
      if (form.voices !== undefined && extras.length === 0) {
        const services = [
          ...new Set(
            form.voices.speakers.flatMap((speaker) => {
              const name = service(speaker.voice.provider);
              return name === undefined ? [] : [name];
            }),
          ),
        ];
        const format = `${voiceFormatLabels[form.voices.format]} with ${String(form.voices.speakers.length)} speakers`;
        return services.length === 0
          ? `${format}; no voices picked yet.`
          : `${format}, read by ${listed(services)}.`;
      }
      const voiceService = service(form.audio.provider);
      if (voiceService === undefined) return "No voice service picked yet.";
      if (form.voices !== undefined)
        return `${voiceFormatLabels[form.voices.format]} with ${String(form.voices.speakers.length)} speakers, read by ${voiceService}${after}.`;
      const voice = context.voices.find(
        (one) => one.provider === form.audio.provider && one.voiceId === form.audio.voice,
      );
      if (form.audio.model === "") return `${voiceService}: no voice model picked yet.`;
      if (form.audio.voice === "") return `${voiceService}: no voice picked yet.`;
      return `Read by ${voice?.name ?? form.audio.voice}, ${article(voiceService)} ${voiceService} voice${after}.`;
    }
    case "images": {
      // With no images drawn here, the thumbnail and the shorts may still be: the row says who
      // draws them, or that nobody is picked to.
      const users = imageServiceUsers(form);
      const others =
        users.length === 0
          ? ""
          : by(form.images) === undefined
            ? ` ${capitalised(listed(users))} still ${users.length === 1 ? "needs" : "need"} an image service.`
            : ` ${capitalised(listed(users))} drawn by ${by(form.images) ?? ""}.`;
      if (form.sources.images === "off") return `No images.${others}`;
      if (form.sources.images === "provide")
        return form.provided.images.length === 0
          ? `Your own images, none attached yet.${others}`
          : `${String(form.provided.images.length)} of your own images.${others}`;
      const counts = form.imagePrompts.map((one) => Number(one.number) || 0);
      const total = counts.reduce((sum, count) => sum + count, 0);
      const styles = listed(form.imagePrompts.map((one) => `“${one.name}”`));
      const drawer = by(form.images);
      const made =
        form.imagePrompts.length === 0
          ? "No image prompt ticked yet."
          : `${total > 0 ? String(total) : "Some"} ${total === 1 ? "image" : "images"} from ${styles}${drawer === undefined ? "" : `, made by ${drawer}`}${
              form.reference !== undefined && form.reference.source !== "off"
                ? ", all in the look of one establishing image"
                : ""
            }.`;
      return drawer === undefined ? `${made} No image service picked yet.` : made;
    }
    case "video": {
      const shape = shapes[form.format] ?? form.format;
      const captions =
        form.sources.audio === "off" || form.subtitles.mode === "off"
          ? "no captions"
          : form.subtitles.mode === "files"
            ? "caption files only"
            : `captions in ${context.fontName ?? "the default font"}`;
      if (kind === "images") return `${shape}.`;
      if (kind === "audiobook" || kind === "podcast")
        return `${captions[0]?.toUpperCase() ?? ""}${captions.slice(1)}.`;
      if (form.sources.video === "off") return `No video: sound only, ${captions}.`;
      // Cuts that follow the narration still hold each image about this long, then wait for a
      // sentence to end.
      const seconds = Number.isFinite(form.imageSeconds) ? String(form.imageSeconds) : undefined;
      const cuts =
        seconds === undefined
          ? "a new image every few seconds"
          : usesNarrationCuts(form)
            ? `a new image about every ${seconds} s, at the end of a sentence`
            : `a new image every ${seconds} s`;
      return `${shape}, ${cuts}, ${lookWords(videoEditOf(form))}, ${captions}.`;
    }
    case "outputs": {
      const thumbnails =
        form.sources.thumbnail === "off"
          ? undefined
          : form.sources.thumbnail === "provide"
            ? "your own thumbnail"
            : form.thumbnailCount === 3
              ? "3 thumbnails"
              : "a thumbnail";
      const parts = [
        thumbnails,
        shortsOn(form) && form.shorts ? `${form.shorts.count} shorts` : undefined,
        form.youtubeDescription === true && form.sources.audio !== "off"
          ? "a YouTube description"
          : undefined,
        form.sources.document === "generate"
          ? `a PDF in the ${documentThemeLabel(form.document)} look`
          : undefined,
      ].filter((part) => part !== undefined);
      if (parts.length > 0) return `Also makes ${listed(parts)}.`;
      return kind === "video"
        ? "The video only: no thumbnail, description, shorts or PDF."
        : "Nothing else.";
    }
    case "reviews": {
      // Each pause as its tick names it: "after the article (before the narration)".
      const pauses = form.checkpoints ?? [];
      const after = listed(pauses.map((stage) => pauseLabel(stage, form).replace(/^Pause /, "")));
      const parts = [
        pauses.length > 0 ? `Pauses for your approval ${after}` : undefined,
        context.reviews > 0
          ? `an AI checks ${String(context.reviews)} ${context.reviews === 1 ? "step" : "steps"}`
          : undefined,
      ].filter((part) => part !== undefined);
      return parts.length === 0
        ? "Runs straight through: no pauses for your approval, no AI checks."
        : `${parts.join("; ")}.`;
    }
    case "channel":
      return `For ${context.channel ?? "the default channel"}, ${
        context.brandKit
          ? "with its brand kit (fonts, intro, outro and sounds)"
          : "without its brand kit"
      }.`;
  }
}

// The Look in words, only what differs from plain cuts: "a 1 s crossfade, a subtle vignette,
// a sepia grade". Animated images are named as paid, since each is a video model call.
export function lookWords(edit: VideoEditSettings): string {
  const level = (value: string): string => value.toLowerCase();
  const parts = [
    edit.transition === "cut"
      ? undefined
      : `a ${String(edit.transitionSeconds)} s ${transitionLabels[edit.transition].toLowerCase()}`,
    edit.vignette === "off" ? undefined : `a ${level(edit.vignette)} vignette`,
    edit.grain === "off" ? undefined : `${level(edit.grain)} film grain`,
    edit.grade === "none" ? undefined : `a ${colorGradeLabels[edit.grade].toLowerCase()} grade`,
    edit.atmosphere === "none"
      ? undefined
      : `drifting ${atmosphereLabels[edit.atmosphere].toLowerCase()}`,
    edit.chapterCards ? "chapter cards" : undefined,
    edit.animate === "off"
      ? undefined
      : edit.animate === "every"
        ? `every ${edit.animateEvery === 2 ? "2nd" : edit.animateEvery === 3 ? "3rd" : `${String(edit.animateEvery)}th`} image animated (paid)`
        : "chapter openers animated (paid)",
  ].filter((part) => part !== undefined);
  return parts.length === 0 ? "no effects" : listed(parts);
}

function capitalised(text: string): string {
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

function nonEmpty(values: Readonly<Record<string, string>>): Readonly<Record<string, string>> {
  return Object.fromEntries(Object.entries(values).filter(([, value]) => value.trim() !== ""));
}
