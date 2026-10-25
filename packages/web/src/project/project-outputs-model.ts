import type { StageKind } from "@app/kernel/pipeline.js";
import { type RunConfig, type Stage, thumbnailCountOf } from "@app/slices/admission/model.js";
import type { Output, OutputRole } from "@app/slices/storage/model.js";
import type { Tone } from "@/components/kit/status";
import { extensionOf } from "./narration-downloads.js";
import type { ZipSet } from "./output-api.js";
import { nextWords, stateOf, versionLine } from "./project-outputs-state.js";
import { stageName } from "./summary.js";

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

// The section each output lives in.
export type OutputSection = "article" | "narration" | "images" | "video" | "shorts" | "document";

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
  // "made Oct 4 14:05", or "made Oct 4 14:05, before the current text".
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
  // The narration the Narration section plays and downloads: its evened-out recording when
  // the volume was levelled, so the two name one file.
  const narration =
    role("audio_export") ??
    outputs.find(
      (output) => output.role === "audio_levelled" && (output.meta.segment ?? "body") === "body",
    ) ??
    role("audio_body");
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
      primary: file(article, "Article")[0],
      // The PDF has its own row.
      alternatives: [
        ...(article?.role === "article_md" ? file(role("article_txt"), "Plain text") : []),
        ...file(role("notes"), "Research notes"),
        ...file(role("sources"), "Research sources"),
      ],
    });

  // The narration, named as the status list names its step. An audiobook's or a podcast's
  // own file is the last step's (its Audiobook or Episode row, below), so one name is one row.
  if (on("audio") || narration !== undefined)
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
          ...(voiced ? file(role("script_md"), "Transcript by speaker") : []),
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
          : // The thumbnails have their own row and their own download, so the images' zip
            // holds the images only.
            { set: "images", members: [...images].sort(byIndex) },
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

  // An audiobook's or a podcast's own file: the last step's, under the name the status list
  // and its section give it ("Audiobook", "Episode"), ahead of the video made with it.
  if (voiced) {
    const format = config.voices?.format ?? "audiobook";
    const book = format === "audiobook" || format === "drama";
    // The file is named for what it is; the row for the step, as the status list names it.
    const own =
      format === "audiobook" ? "Audiobook" : format === "drama" ? "Radio drama" : "Episode";
    const m4b = role("audio_m4b");
    const mp3 = role("audio_mp3");
    const primary = book
      ? (file(m4b, `${own} with chapters`)[0] ?? file(mp3, `${own} with chapters`)[0])
      : (file(mp3, own)[0] ?? file(m4b, own)[0]);
    build("voices", stageName("video", config), "video", ["video"], primary?.output, {
      primary,
      alternatives: file(book ? mp3 : m4b, book ? "MP3 with chapters" : "M4B with chapters").filter(
        (one) => one.output.id !== primary?.output.id,
      ),
      source: { name: "narration", output: narration },
    });
  }

  const video = role("video");
  if ((on("video") && config.sources.video !== "off") || video !== undefined)
    build("video", "Video", "video", ["video"], video, {
      primary: file(video, "Video")[0],
      // The thumbnails have their own row.
      alternatives: [
        ...file(role("subtitles_srt"), "Captions"),
        ...file(role("subtitles_vtt"), "Captions"),
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
    build("shorts", "Shorts", "shorts", ["video"], shorts[0], {
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

// How many files All files lists: each row's downloads, a set's members counted once.
export function fileCount(input: OutputsInput): number {
  const ids = new Set<string>();
  for (const row of projectOutputs(input)) {
    if (row.primary !== undefined) ids.add(row.primary.output.id);
    for (const one of row.alternatives) ids.add(one.output.id);
    for (const one of row.set?.members ?? []) ids.add(one.id);
  }
  return ids.size;
}

function byIndex(a: Output, b: Output): number {
  const order = (one: Output): number =>
    (one.role === "thumbnail" ? 1000 : 0) + Number(one.meta.index ?? 1);
  return order(a) - order(b);
}
