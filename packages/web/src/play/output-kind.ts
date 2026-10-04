import type { StageSource } from "@app/slices/admission/model.js";
import { defaultVoicesSettings, type Speaker } from "@app/slices/voices/model.js";
import type { SetupRowId } from "./setup-rows";
import type { PlayFormState } from "./state";

// What the person is making: five peer starting points over the one pipeline. Nothing is stored
// for it; it is read back from the stage sources (and the speaker format), so a draft, a
// template and a project made before it all have one, and the server needs no new field.
export const outputKinds = ["video", "article", "audiobook", "podcast", "images"] as const;
export type OutputKind = (typeof outputKinds)[number];

export const outputKindInfo: Readonly<
  Record<OutputKind, { readonly label: string; readonly line: string }>
> = {
  video: { label: "Video", line: "Narration over images, with captions" },
  article: { label: "Article", line: "Written text, also as a PDF" },
  audiobook: { label: "Audiobook", line: "A text read aloud by a narrator" },
  podcast: { label: "Podcast", line: "A conversation between speakers" },
  images: { label: "Images", line: "Pictures from your prompts" },
};

type KindForm = {
  readonly sources: Pick<PlayFormState["sources"], "audio" | "images" | "video">;
  readonly voices?: PlayFormState["voices"];
};

const conversation = (form: Pick<PlayFormState, "voices">): boolean =>
  form.voices?.format === "podcast" || form.voices?.format === "interview";

export function outputKindOf(form: KindForm): OutputKind {
  const { sources } = form;
  if (sources.video === "generate" && sources.images !== "off") return "video";
  if (sources.audio !== "off") return conversation(form) ? "podcast" : "audiobook";
  if (sources.images !== "off") return "images";
  return "article";
}

const on = (source: StageSource, fallback: StageSource): StageSource =>
  source === "off" ? fallback : source;

// What picking a starting point changes: the stages it needs come on (keeping a provided source
// as provided), the ones it doesn't go off, and the video-only extras switch off with the video.
// Everything else (prompts, voices, style) is kept, so switching back loses nothing typed.
export function outputKindPatch(
  form: PlayFormState,
  kind: OutputKind,
  hosts: readonly Speaker[] = [],
): Partial<PlayFormState> {
  const s = form.sources;
  const standalone = {
    youtubeDescription: false,
    ...(form.shorts === undefined ? {} : { shorts: { ...form.shorts, enabled: false } }),
  };
  const quiet = { images: "off", video: "off", thumbnail: "off" } as const;
  switch (kind) {
    case "video":
      return {
        sources: {
          ...s,
          article: on(s.article, "generate"),
          audio: on(s.audio, "generate"),
          images: on(s.images, "generate"),
          video: "generate",
        },
      };
    case "article":
      return {
        sources: { ...s, ...quiet, article: on(s.article, "generate"), audio: "off" },
        ...standalone,
      };
    case "audiobook":
      return {
        sources: {
          ...s,
          ...quiet,
          article: on(s.article, "provide"),
          audio: on(s.audio, "generate"),
        },
        // One narrator unless the book already has its own speakers.
        ...(conversation(form) ? { voices: undefined } : {}),
        ...standalone,
      };
    case "podcast":
      return {
        sources: { ...s, ...quiet, article: on(s.article, "generate"), audio: "generate" },
        ...(conversation(form) ? {} : { voices: defaultVoicesSettings("podcast", [...hosts]) }),
        ...standalone,
      };
    case "images":
      return {
        sources: {
          ...s,
          ...quiet,
          research: "off",
          article: "off",
          audio: "off",
          document: "off",
          images: on(s.images, "generate"),
        },
        ...standalone,
      };
  }
}

// The setup rows each starting point needs. A row that holds a problem, or that is open, shows
// whatever was picked, so nothing that blocks Start is ever out of reach.
const rowsOfKind: Readonly<Record<OutputKind, readonly SetupRowId[]>> = {
  video: ["title", "article", "narration", "images", "video", "outputs", "reviews", "channel"],
  article: ["title", "article", "outputs", "reviews", "channel"],
  // Captions, pauses and loudness of spoken work sit under Video and style, as does the frame
  // format the images are drawn in.
  audiobook: ["title", "article", "narration", "video", "outputs", "reviews", "channel"],
  podcast: ["title", "article", "narration", "video", "outputs", "reviews", "channel"],
  images: ["title", "images", "video", "reviews", "channel"],
};

export function rowShown(
  row: SetupRowId,
  kind: OutputKind,
  extra: { readonly problem: boolean; readonly open: boolean },
): boolean {
  return rowsOfKind[kind].includes(row) || extra.problem || extra.open;
}

// The thumbnail, the YouTube description and Shorts are publishing extras: in view for a video,
// folded for everything else.
export function publishes(kind: OutputKind): boolean {
  return kind === "video";
}

export function headingOf(kind: OutputKind): string {
  switch (kind) {
    case "video":
      return "What's the video about?";
    case "article":
      return "What's the article about?";
    case "audiobook":
      return "What's the audiobook about?";
    case "podcast":
      return "What's the episode about?";
    case "images":
      return "What are the images of?";
  }
}

const nouns: Readonly<Record<OutputKind, readonly [string, string]>> = {
  video: ["video", "videos"],
  article: ["article", "articles"],
  audiobook: ["audiobook", "audiobooks"],
  podcast: ["episode", "episodes"],
  images: ["image set", "image sets"],
};

// "1 video", "3 articles": what Start makes, named after the work being made.
export function outputCount(kind: OutputKind, count: number): string {
  const [one, many] = nouns[kind];
  return count === 1 ? `1 ${one}` : `${String(count)} ${many}`;
}

export function outputNoun(kind: OutputKind): string {
  return nouns[kind][0];
}
