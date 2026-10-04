import type { StageKind } from "@app/kernel/pipeline.js";
import { type RunConfig, type Stage, thumbnailCountOf } from "@app/slices/admission/model.js";
import type { Output, OutputRole } from "@app/slices/storage/model.js";
import { voiceFormatLabels } from "@app/slices/voices/model.js";
import type { Tone } from "@/components/kit/status";
import { extensionOf } from "./narration-downloads.js";
import type { ZipSet } from "./output-api.js";
import { nextWords, stateOf, versionLine } from "./project-outputs-state.js";

export { when } from "./project-outputs-state.js";

// The outputs a project holds, as a person names them (the article, its narration, the video,
// the PDF), each with its state in words, which source it was made from, its main export and
// the alternatives beside it. Pure: the project page draws it, and each rule is tested here.

export type OutputKind =
  | "article"
  | "narration"
  | "voices"
  | "images"
  | "thumbnails"
  | "video"
  | "shorts"
  | "pdf";

// The rail section each output lives in.
export type OutputSection = "article" | "narration" | "images" | "video" | "document";

export type OutputState = "current" | "older" | "working" | "failed" | "waiting" | "missing";

export interface ExportFile {
  readonly output: Output;
  // "Video (.mp4)", "Subtitles (.srt)".
  readonly label: string;
}

export interface ProjectOutput {
  readonly kind: OutputKind;
  readonly title: string;
  readonly section: OutputSection;
  readonly state: OutputState;
  readonly tone: Tone;
  readonly stateWords: string;
  // The file the preview and the version line are about.
  readonly main: Output | undefined;
  // "Made 4 Oct, 14:05 from the article of 3 Oct, 13:40".
  readonly version: string | undefined;
  // The export a person most likely wants, named for what it is.
  readonly primary: ExportFile | undefined;
  // A set downloaded as one zip, its members listed before the download.
  readonly set: { readonly set: ZipSet; readonly members: readonly Output[] } | undefined;
  readonly alternatives: readonly ExportFile[];
  // What to do next, in words; the page links it to the output's section.
  readonly next: string;
}

export interface OutputsInput {
  readonly config: RunConfig;
  readonly stages: readonly Stage[];
  readonly outputs: readonly Output[];
  // The current version's own word for each file; absent on a project without versions.
  readonly states?: ReadonlyMap<string, "ready" | "outdated" | "review" | "missing">;
}

export function projectOutputs(input: OutputsInput): readonly ProjectOutput[] {
  const { config, stages, outputs } = input;
  const stage = (kind: StageKind): Stage | undefined => stages.find((one) => one.kind === kind);
  const on = (kind: StageKind): boolean => {
    const found = stage(kind);
    return found !== undefined && found.state !== "skipped";
  };
  const role = (wanted: OutputRole): Output | undefined =>
    outputs.find((output) => output.role === wanted);
  const roles = (wanted: OutputRole): readonly Output[] =>
    outputs.filter((output) => output.role === wanted);
  const file = (output: Output | undefined, name: string): readonly ExportFile[] =>
    output === undefined ? [] : [{ output, label: `${name}${extensionOf(output)}` }];
  // A provided article is kept as the text it was given; a written one also has Markdown.
  const article = role("article_md") ?? role("article_txt");
  const narration = role("audio_export") ?? role("audio_body");
  const voiced = config.voices !== undefined && config.sources.audio === "generate";
  const list: ProjectOutput[] = [];
  const build = (
    kind: OutputKind,
    title: string,
    section: OutputSection,
    kinds: readonly StageKind[],
    main: Output | undefined,
    exports: {
      readonly primary?: ExportFile | undefined;
      readonly set?: ProjectOutput["set"];
      readonly alternatives?: readonly ExportFile[];
      readonly members?: readonly Output[];
      readonly source?: { readonly name: string; readonly output: Output | undefined };
    },
  ): void => {
    const members = exports.members ?? [
      ...(exports.primary === undefined ? [] : [exports.primary.output]),
      ...(exports.alternatives ?? []).map((one) => one.output),
    ];
    const status = stateOf(
      kinds.flatMap((kind) => stage(kind) ?? []),
      main,
      members,
      input.states,
    );
    list.push({
      kind,
      title,
      section,
      ...status,
      main,
      version: versionLine(main, status.state, exports.source),
      primary: exports.primary,
      set: exports.set,
      alternatives: exports.alternatives ?? [],
      next: nextWords(status.state, section),
    });
  };

  if (on("article") || on("research") || article !== undefined)
    build("article", "Article", "article", ["research", "article"], article, {
      primary: file(article, article?.role === "article_md" ? "Markdown" : "Plain text")[0],
      alternatives: [
        ...(article?.role === "article_md" ? file(role("article_txt"), "Plain text") : []),
        ...file(role("document_pdf"), "PDF"),
        ...file(role("notes"), "Research notes"),
        ...file(role("sources"), "Research sources"),
      ],
    });

  if (voiced) {
    const format = config.voices?.format ?? "audiobook";
    const book = format === "audiobook" || format === "drama";
    const m4b = role("audio_m4b");
    const mp3 = role("audio_mp3");
    const primary = book
      ? (file(m4b, "Audiobook with chapters")[0] ?? file(mp3, "Audiobook with chapters")[0])
      : (file(mp3, "Episode")[0] ?? file(m4b, "Episode")[0]);
    build("voices", voiceFormatLabels[format], "narration", ["audio", "video"], primary?.output, {
      primary,
      alternatives: [
        ...file(book ? mp3 : m4b, book ? "MP3 with chapters" : "M4B with chapters").filter(
          (one) => one.output.id !== primary?.output.id,
        ),
        ...file(role("script_md"), "Transcript by speaker"),
        ...file(role("audio_body"), "Narration track"),
      ],
      source: { name: "text", output: article },
    });
  } else if (on("audio") || narration !== undefined)
    build(
      "narration",
      "Narration",
      "narration",
      on("video") ? ["audio"] : ["audio", "video"],
      narration,
      {
        primary: file(narration, "Narration")[0],
        alternatives: [
          ...(narration?.role === "audio_export" ? file(role("audio_body"), "Body narration") : []),
          ...file(role("audio_intro"), "Intro narration"),
          ...file(role("audio_outro"), "Outro narration"),
          ...file(
            outputs.find((one) => one.role === "narration_txt" && one.meta.segment === "body"),
            "Spoken text",
          ),
        ],
        source: { name: "text", output: article },
      },
    );

  const images = roles("image");
  const thumbnails = roles("thumbnail").filter(
    (one) => (one.meta.index ?? 1) <= thumbnailCountOf(config),
  );
  if (on("images") || images.length > 0)
    build("images", "Images", "images", ["images"], images[0], {
      set:
        images.length === 0
          ? undefined
          : { set: "images", members: [...images, ...thumbnails].sort(byIndex) },
      members: images,
      alternatives: [],
      source: { name: "text", output: article },
    });

  if (on("thumbnail") || thumbnails.length > 0)
    build(
      "thumbnails",
      thumbnails.length > 1 ? "Thumbnails" : "Thumbnail",
      "images",
      ["thumbnail"],
      thumbnails[0],
      {
        ...(thumbnails.length > 1
          ? { set: { set: "thumbnails" as const, members: [...thumbnails].sort(byIndex) } }
          : { primary: file(thumbnails[0], "Thumbnail")[0] }),
        members: thumbnails,
      },
    );

  const video = role("video");
  if ((on("video") && config.sources.video !== "off") || video !== undefined)
    build("video", "Video", "video", ["video"], video, {
      primary: file(video, "Video")[0],
      alternatives: [
        ...file(role("subtitles_srt"), "Subtitles"),
        ...file(role("subtitles_vtt"), "Subtitles"),
        ...thumbnails.flatMap((one) =>
          file(
            one,
            thumbnails.length > 1 ? `Thumbnail ${String(one.meta.index ?? 1)}` : "Thumbnail",
          ),
        ),
        ...file(role("youtube_description"), "YouTube description"),
        ...file(role("youtube_tags"), "YouTube tags"),
      ],
      members: video === undefined ? [] : [video],
      source: { name: "narration", output: narration },
    });

  const shorts = [...roles("short_video")].sort(
    (a, b) => Number(a.meta.short ?? 0) - Number(b.meta.short ?? 0),
  );
  if (shorts.length > 0 || config.shorts?.enabled === true)
    build("shorts", "Shorts", "video", ["video"], shorts[0], {
      set: shorts.length === 0 ? undefined : { set: "shorts", members: shorts },
      alternatives: shorts.flatMap((one) => file(one, `Short ${String(one.meta.short ?? 1)}`)),
      // Shorts are cut from the narration and pictures, not from the finished video.
      source: { name: "narration", output: narration },
    });

  const pdf = role("document_pdf");
  if (on("document") || pdf !== undefined)
    build("pdf", "PDF", "document", ["document"], pdf, {
      primary: file(pdf, "PDF")[0],
      source: { name: "article", output: article },
    });

  return list;
}

function byIndex(a: Output, b: Output): number {
  const order = (one: Output): number =>
    (one.role === "thumbnail" ? 1000 : 0) + Number(one.meta.index ?? 1);
  return order(a) - order(b);
}
