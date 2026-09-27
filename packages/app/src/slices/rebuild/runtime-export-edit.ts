import { readFileSync } from "node:fs";
import { extname } from "node:path";
import { z } from "zod";
import type { StageContext } from "../../kernel/runner/index.js";
import type { RunConfig } from "../admission/model.js";
import { usesYoutubeDescription } from "../admission/rules.js";
import { resolveFont } from "../fonts/index.js";
import type { RevisionView } from "../revisions/model.js";
import { outputPath } from "../storage/layout.js";
import { headingChapters, type TimedChapter } from "../video/chapters.js";
import { sentenceCutPoints } from "../video/cuts.js";
import type { VideoSource } from "../video/edit-list.js";
import {
  usesChapterCards,
  usesNarrationCuts,
  type VideoEditSettings,
  videoEditOf,
} from "../video/edit-settings.js";
import { probeDurationMs } from "../video/ffmpeg.js";
import type { PlanEdit } from "../video/plan.js";
import type { ExportExecutionDeps } from "./runtime-export.js";
import { wordsSchema } from "./runtime-subtitles.js";

// What the render reads beyond the images and the sound, from the files the revision saved:
// the word timing and chapters the cuts and cards follow, the clips that play in place of
// images (uploaded ones and animated ones), and the sentences to show for any image that
// could not be animated. Absent settings give no edit at all, which renders today's slideshow.

export interface ExportEdit {
  readonly edit: PlanEdit | undefined;
  // Plain sentences for the project page, one per image shown still instead of animated.
  readonly warnings: readonly string[];
  // What render.json records beside the edit list.
  readonly settings: VideoEditSettings | undefined;
}

// The containers an uploaded clip may come in; anything else in the images is a still.
const clipExtensions: ReadonlySet<string> = new Set([".mp4", ".mov", ".m4v", ".webm", ".mkv"]);

export function isClipPath(path: string): boolean {
  return clipExtensions.has(extname(path).toLowerCase());
}

export async function exportEdit(
  deps: ExportExecutionDeps,
  context: StageContext,
  view: RevisionView,
  images: readonly string[],
): Promise<ExportEdit> {
  const config = view.revision.config;
  const order = view.revision.content.imageOrder;
  const ready = (key: string) =>
    view.outputs.find(
      (row) => row.workKey === key && row.selected && row.available && row.state === "ready",
    );
  // Clips: an animated image's clip first, then an uploaded clip in the image's own place.
  const clips: (VideoSource | undefined)[] = [];
  for (const [index, key] of order.entries()) {
    const animated = ready(`animate:${key}`);
    const path =
      animated?.output.role === "animated_image"
        ? outputPath(deps.paths, context.work.projectId, animated.output.path)
        : images[index] !== undefined && isClipPath(images[index] ?? "")
          ? images[index]
          : undefined;
    clips.push(
      path === undefined
        ? undefined
        : { kind: "video", path, seconds: await clipSeconds(deps, context, path, index + 1) },
    );
  }
  const warnings = view.pieces.flatMap((row) => {
    if (!row.key.startsWith("animate:") || !row.selected || row.piece.state !== "done") return [];
    const parsed = z
      .object({ fallback: z.string() })
      .safeParse(JSON.parse(row.piece.payload ?? "null"));
    return parsed.success ? [parsed.data.fallback] : [];
  });
  const endScreen = config.endScreen?.text.trim() ?? "";
  if (config.videoEdit === undefined) {
    const titles = endScreen === "" ? undefined : await titleFont(deps, config);
    return {
      edit:
        titles !== undefined
          ? { clips, cards: { chapters: [], ...titles, endScreen } }
          : clips.some((clip) => clip !== undefined)
            ? { clips }
            : undefined,
      warnings,
      settings: undefined,
    };
  }
  const settings = videoEditOf(config);
  const cuts = usesNarrationCuts(config);
  const cards = usesChapterCards(config);
  const words = cuts || cards ? timingWords(deps, context, view) : [];
  const chapters = cuts || cards ? chaptersOf(view, config, words) : [];
  const titles = cards || endScreen !== "" ? await titleFont(deps, config) : undefined;
  return {
    edit: {
      clips,
      ...(cuts
        ? {
            narration: {
              cutPoints: sentenceCutPoints(words),
              chapterStarts: chapters.map((chapter) => chapter.start),
            },
          }
        : {}),
      ...(settings.transition === "cut"
        ? {}
        : { transition: { kind: settings.transition, seconds: settings.transitionSeconds } }),
      look: {
        vignette: settings.vignette,
        grain: settings.grain,
        grade: settings.grade,
        atmosphere: settings.atmosphere,
      },
      ...(titles === undefined
        ? {}
        : {
            cards: {
              chapters: cards ? chapters : [],
              ...titles,
              ...(endScreen === "" ? {} : { endScreen }),
            },
          }),
    },
    warnings,
    settings,
  };
}

// The cards' font and colour: the brand kit's title style, else the caption font in white.
async function titleFont(
  deps: ExportExecutionDeps,
  config: RunConfig,
): Promise<{
  readonly font: { readonly path: string; readonly name: string };
  readonly color?: string;
}> {
  const font = await resolveFont(
    deps.paths,
    config.titleStyle?.fontId ?? config.subtitles?.fontId ?? "default",
  );
  return {
    font: { path: font.path, name: font.assName },
    ...(config.titleStyle?.color === undefined ? {} : { color: config.titleStyle.color }),
  };
}

function timingWords(deps: ExportExecutionDeps, context: StageContext, view: RevisionView) {
  const timing = view.outputs.find(
    (row) =>
      row.selected &&
      row.available &&
      row.state === "ready" &&
      row.workKey === "subtitles:timing" &&
      row.output.role === "subtitle_words",
  );
  if (timing === undefined)
    throw new Error(
      "The narration's word timing, which the video's cuts and chapter cards follow, is missing. Use Re-run section on Video, then Retry stage.",
    );
  return wordsSchema.parse(
    JSON.parse(
      readFileSync(outputPath(deps.paths, context.work.projectId, timing.output.path), "utf8"),
    ),
  ).words;
}

// The YouTube description's chapters when that step runs, the article's headings otherwise.
function chaptersOf(
  view: RevisionView,
  config: RunConfig,
  words: Parameters<typeof headingChapters>[1],
): readonly TimedChapter[] {
  if (usesYoutubeDescription(config)) {
    const row = view.pieces.find(
      (one) => one.key === "youtube:description" && one.selected && one.piece.state === "done",
    );
    const parsed = z
      .object({ chapters: z.array(z.object({ start: z.number(), title: z.string() })) })
      .safeParse(JSON.parse(row?.piece.payload ?? "null"));
    if (parsed.success) return parsed.data.chapters;
  }
  return headingChapters(view.articleMarkdown ?? "", words);
}

async function clipSeconds(
  deps: ExportExecutionDeps,
  context: StageContext,
  path: string,
  place: number,
): Promise<number> {
  let ms: number;
  try {
    ms = await probeDurationMs(deps.ffmpeg, path, context.signal, deps.log);
  } catch (error) {
    if (context.signal.aborted) throw error;
    ms = 0;
  }
  if (!(ms > 0))
    throw new Error(
      `Image ${String(place)} is a video clip Slopify can't read, so the video can't show it. Replace it with another clip or an image in Edit project → Images, then Retry stage.`,
    );
  return ms / 1000;
}
