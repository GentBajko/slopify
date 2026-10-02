import { readFileSync } from "node:fs";
import { extname } from "node:path";
import { z } from "zod";
import type { StageContext } from "../../kernel/runner/index.js";
import type { Format, RunConfig } from "../admission/model.js";
import { usesFigureCards, usesYoutubeDescription } from "../admission/rules.js";
import { captionFont, captionFontDeps } from "../fonts/coverage.js";
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
import { passageSpans } from "../video/figure-spans.js";
import type { FigureShot, PlanEdit } from "../video/plan.js";
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
  const figures = usesFigureCards(config) ? figureShots(deps, context, view) : [];
  const withFigures = figures.length === 0 ? {} : { figures };
  if (config.videoEdit === undefined) {
    const titles = endScreen === "" ? undefined : await titleFont(deps, config);
    return {
      edit:
        titles !== undefined
          ? { clips, cards: { chapters: [], ...titles, endScreen }, ...withFigures }
          : clips.some((clip) => clip !== undefined) || figures.length > 0
            ? { clips, ...withFigures }
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
      ...withFigures,
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
  const fontId = config.titleStyle?.fontId ?? config.subtitles?.fontId ?? "default";
  // Chapter titles are in the project language too, so they need its letters.
  const font =
    config.language === undefined || config.language === "en"
      ? await resolveFont(deps.paths, fontId)
      : await captionFont(captionFontDeps(deps.paths), fontId, config.language);
  return {
    font: { path: font.path, name: font.assName },
    ...(config.titleStyle?.color === undefined ? {} : { color: config.titleStyle.color }),
  };
}

export function timingWords(deps: ExportExecutionDeps, context: StageContext, view: RevisionView) {
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
      "The narration's word timing, which the video's cuts and chapter cards follow, is missing. Use More → Render the video again in the Video section, then Try again.",
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
      `Image ${String(place)} is a video clip Slopify can't read, so the video can't show it. Replace it with another clip or an image in Edit project → Images, then Try again.`,
    );
  return ms / 1000;
}

// Each card in the video's frame, shown where its description is spoken: the description's
// answer found in the word timing (`video/figure-spans.ts`). A card whose description can't be
// found in the timing is left out rather than shown at the wrong moment.
export function figureShots(
  deps: ExportExecutionDeps,
  context: StageContext,
  view: RevisionView,
  format: Format = view.revision.config.format,
  words: Parameters<typeof passageSpans>[0] = timingWords(deps, context, view),
): readonly FigureShot[] {
  const cards = view.outputs
    .filter(
      (row) =>
        row.selected &&
        row.available &&
        row.state === "ready" &&
        row.output.role === "figure_card" &&
        row.workKey.startsWith("figure:card:") &&
        (row.output.meta.format ?? view.revision.config.format) === format,
    )
    .map((row) => ({
      index: Number(row.workKey.slice("figure:card:".length)),
      path: outputPath(deps.paths, context.work.projectId, row.output.path),
    }))
    .toSorted((a, b) => a.index - b.index);
  const passages = cards.map((card) => {
    const row = view.pieces.find(
      (one) =>
        one.key === `narration:describe:${String(card.index)}` &&
        one.selected &&
        one.piece.state === "done",
    );
    const parsed = z
      .object({ text: z.string() })
      .safeParse(JSON.parse(row?.piece.payload ?? "null"));
    return parsed.success ? parsed.data.text : "";
  });
  const spans = passageSpans(words, passages);
  return cards.flatMap((card, at) => {
    const span = spans[at];
    return span === undefined ? [] : [{ path: card.path, start: span.start, end: span.end }];
  });
}
