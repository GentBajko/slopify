import { type StageKind, stageKinds } from "../../kernel/pipeline.js";
import { type RunConfig, type StageSources, sourceOf } from "../admission/model.js";
import { defaultVoicesSettings, type VoicesSettings } from "../voices/model.js";

// Another output made from a project that already exists: the same brief, sources and
// accepted text, with one more kind of result switched on. It is a new revision of the same
// project, so the results already accepted are reused by the rebuild and only the new stages
// run. A podcast is an adaptation: the text model rewrites the article as a two-host
// conversation for the narration (`voices` source `adapt`), the article stays as written and the
// conversation is kept beside it as the script. That rewrite is said in the plan (`adapts`) and
// has to be accepted explicitly. A project has one narration, so an audiobook or podcast is
// not added over narration it already has.
export const addableOutputs = [
  "narration",
  "audiobook",
  "images",
  "video",
  "pdf",
  "podcast",
] as const;
export type AddableOutput = (typeof addableOutputs)[number];

export const addableOutputLabels: Readonly<Record<AddableOutput, string>> = {
  narration: "Narration",
  audiobook: "Audiobook (chaptered MP3 and M4B)",
  images: "Images",
  video: "Video",
  pdf: "PDF",
  podcast: "Podcast (adapts your text into a conversation)",
};

// What one stage's result is called where the plan lists it.
const stageResults: Readonly<Record<StageKind, string>> = {
  research: "Research notes and sources",
  article: "Accepted article text",
  audio: "Narration",
  images: "Slideshow images",
  thumbnail: "Thumbnail",
  video: "Video",
  document: "PDF",
};

export interface AddedOutputPlan {
  readonly kind: AddableOutput;
  readonly config: RunConfig;
  // The stages switched on by this addition, in pipeline order.
  readonly stages: readonly StageKind[];
  // What the new output is made from, already accepted: kept exactly as it is.
  readonly reused: readonly string[];
  // What has to be made, in words.
  readonly created: readonly string[];
  // How the existing text is used, in words.
  readonly textUse: string;
  // The text model rewrites the text for this output; the person has to accept that.
  readonly adapts: boolean;
}

export type AddedOutputRefusal = {
  readonly ok: false;
  readonly reason: "already" | "needs-article" | "narration-taken";
  readonly message: string;
};

export function planAddedOutput(
  config: RunConfig,
  kind: AddableOutput,
): { readonly ok: true; readonly plan: AddedOutputPlan } | AddedOutputRefusal {
  const on = (stage: StageKind): boolean => sourceOf(config.sources, stage) !== "off";
  if (!on("article") && kind !== "images")
    return {
      ok: false,
      reason: "needs-article",
      message: `${addableOutputLabels[kind]} is made from the project's text, and this project has none. Open Settings in this project, set Article to Generate or Provide, save, then add it.`,
    };
  if (present(config, kind))
    return {
      ok: false,
      reason: "already",
      message: `This project already makes ${lowerLabel(kind)}. Find it in its section on the left.`,
    };
  if ((kind === "audiobook" || kind === "podcast") && on("audio"))
    return {
      ok: false,
      reason: "narration-taken",
      message: `This project already has narration, and a project has one: ${kind === "podcast" ? "a podcast" : "an audiobook"} would replace it. Keep it, or change its format under Speakers in this project's Settings → Providers.`,
    };
  const sources = switchedOn(config, kind);
  const next: RunConfig = {
    ...config,
    sources,
    ...(kind === "audiobook" ? { voices: audiobookVoices(config) } : {}),
    ...(kind === "podcast" ? { voices: podcastVoices(config) } : {}),
    // A description or shorts are parts of a video: switched on with one, never charged for
    // when only narration or a PDF is added.
    ...(kind === "video" || on("audio")
      ? {}
      : { youtubeDescription: undefined, shorts: undefined }),
  };
  const stages = stageKinds.filter((stage) => !on(stage) && sourceOf(sources, stage) !== "off");
  const kept = stageKinds.filter((stage) => on(stage) && stage !== "thumbnail");
  return {
    ok: true,
    plan: {
      kind,
      config: next,
      stages,
      reused: ["Brief: title, prompts and keywords", ...kept.map((stage) => stageResults[stage])],
      created: createdWords(kind, stages),
      textUse:
        kind === "podcast"
          ? "Adapted: the text model rewrites your article as a conversation between two hosts for the narration. The article stays as written; the conversation is kept beside it as the script."
          : kind === "images"
            ? "Your text is not changed."
            : "Your text is used as written: nothing is rewritten.",
      adapts: kind === "podcast",
    },
  };
}

function present(config: RunConfig, kind: AddableOutput): boolean {
  const on = (stage: StageKind): boolean => sourceOf(config.sources, stage) !== "off";
  switch (kind) {
    case "narration":
      return on("audio");
    case "audiobook":
      return on("audio") && config.voices?.audioFiles === true;
    case "images":
      return on("images");
    case "video":
      return on("video");
    case "pdf":
      return on("document");
    case "podcast":
      return on("audio") && config.voices?.format === "podcast";
  }
}

function switchedOn(config: RunConfig, kind: AddableOutput): StageSources {
  const sources = config.sources;
  const audio = sources.audio === "off" ? "generate" : sources.audio;
  switch (kind) {
    case "narration":
    case "audiobook":
    case "podcast":
      return { ...sources, audio };
    case "images":
      return { ...sources, images: "generate" };
    case "video":
      return {
        ...sources,
        audio,
        images: sources.images === "off" ? "generate" : sources.images,
        video: "generate",
      };
    case "pdf":
      return { ...sources, document: "generate" };
  }
}

// One narrator reading the text as written; the text model only hands any quoted dialogue to
// the speakers (`attribute`). An audiobook the project already sets up keeps its own speakers.
function audiobookVoices(config: RunConfig): VoicesSettings {
  const base = config.voices ?? {
    ...defaultVoicesSettings("audiobook"),
    source: "attribute" as const,
  };
  const voice = config.audio;
  return {
    ...base,
    audioFiles: true,
    speakers: base.speakers.map((speaker) =>
      speaker.voice.voice === "" && voice !== undefined
        ? {
            ...speaker,
            voice: { provider: voice.provider, model: voice.model, voice: voice.voice },
          }
        : speaker,
    ),
  };
}

// Two hosts talk the article through; the first speaks in the project's narration voice and
// the second needs a voice of its own, chosen in Settings.
function podcastVoices(config: RunConfig): VoicesSettings {
  const base = { ...defaultVoicesSettings("podcast"), source: "adapt" as const, audioFiles: true };
  const voice = config.audio;
  return {
    ...base,
    speakers: base.speakers.map((speaker, at) =>
      at === 0 && voice !== undefined
        ? {
            ...speaker,
            voice: { provider: voice.provider, model: voice.model, voice: voice.voice },
          }
        : speaker,
    ),
  };
}

function createdWords(kind: AddableOutput, stages: readonly StageKind[]): readonly string[] {
  const words: string[] = [];
  if (kind === "podcast") words.push("A conversation script adapted from your article");
  if (stages.includes("audio"))
    words.push(
      kind === "audiobook"
        ? "Narration by the narrator voice"
        : kind === "podcast"
          ? "Narration by the two hosts"
          : "Narration of the text",
    );
  if (kind === "podcast") words.push("The episode as MP3 and M4B with chapters");
  if (kind === "audiobook") words.push("Chaptered MP3 and M4B files");
  if (kind === "narration") words.push("The narration as one audio file");
  if (stages.includes("images")) words.push("Slideshow images");
  if (stages.includes("video")) words.push("The rendered video");
  if (stages.includes("document")) words.push("The PDF, with a linked contents page");
  return words;
}

function lowerLabel(kind: AddableOutput): string {
  const label = addableOutputLabels[kind];
  if (kind === "pdf") return "a PDF";
  if (kind === "podcast") return "a podcast";
  return label.charAt(0).toLowerCase() + label.slice(1);
}
