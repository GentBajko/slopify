import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Log } from "../../kernel/log.js";
import type { Paths } from "../../kernel/paths.js";
import { defaultMotionStyle, defaultZoomPercent } from "../admission/rules.js";
import { isMissingFont, resolveBoldFont, resolveFont } from "../fonts/index.js";
import { renderShort } from "../shorts/render.js";
import { serializeAss } from "../subtitles/captions.js";
import { subtitleFrame } from "../subtitles/layout.js";
import type { EditList } from "../video/edit-list.js";
import { planRender } from "../video/plan.js";
import { renderSlideshow } from "../video/slideshow.js";
import { bundledSampleAssets, type SampleAssets, sampleNarrationSeconds } from "./narration.js";
import { stylePreviewSeconds } from "./schema.js";
import { previewCues, previewWords, type StylePreviewSettings } from "./settings.js";

// The preview goes through the same planner and renderer as a real video: `planRender` builds
// the edit list (motion, transitions, the Look, the chapter card), the captions are the same
// ASS script `prepareSubtitles` writes, and `renderSlideshow` encodes it clip by clip. The
// Shorts layout goes through `renderShort`, as a short-mode video and every cut short do. Only
// the inputs are the bundled sample's: three of its images and six seconds of its narration
// with the word timing (`narration.ts`); no provider is ever called.

// `picture` is a still to draw every shot from instead of the sample stills.
export type StylePreviewRenderer = (
  settings: StylePreviewSettings,
  output: string,
  signal: AbortSignal,
  picture?: string,
) => Promise<void>;

export type StylePreviewFailure = "ffmpeg-missing" | "font-missing" | "render-failed";

export class StylePreviewError extends Error {
  constructor(
    readonly reason: StylePreviewFailure,
    message: string,
  ) {
    super(message);
  }
}

// ceiling: small enough to render in a few seconds on a laptop, big enough to judge a font.
// The short side is 270 px; the captions' script keeps its full-size frame and libass scales
// it, so a caption sits exactly where it would in the real video.
const previewFrame = {
  "16:9": { width: 480, height: 270 },
  "9:16": { width: 270, height: 480 },
  "1:1": { width: 360, height: 360 },
} as const;
const shotSeconds = stylePreviewSeconds / 3;
const chapterTitle = "Chapter one";

export interface FfmpegPreviewDeps {
  readonly ffmpeg: string;
  readonly paths: Paths;
  readonly log: Log;
  // Where renders are worked on.
  readonly dir: string;
  // The sample's narration and images; the bundled ones unless a test gives others.
  readonly assets?: SampleAssets | undefined;
}

export function ffmpegStylePreview(deps: FfmpegPreviewDeps): StylePreviewRenderer {
  const assets = deps.assets ?? bundledSampleAssets();
  return async (settings, output, signal, picture) => {
    try {
      // A real picture is shown for all three shots: the motion, the Look and the captions read
      // on it, and the transition and chapter card still show at the cuts.
      const images =
        picture !== undefined
          ? [picture, picture, picture]
          : settings.format === "9:16"
            ? assets.tall
            : assets.wide;
      if (settings.short !== undefined)
        await renderShortPreview(deps, settings, settings.short, assets, images, output, signal);
      else await renderPreview(deps, settings, assets, images, output, signal);
    } catch (error) {
      throw explained(deps.log, error);
    }
  };
}

async function renderPreview(
  deps: FfmpegPreviewDeps,
  settings: StylePreviewSettings,
  assets: SampleAssets,
  images: readonly string[],
  output: string,
  signal: AbortSignal,
): Promise<void> {
  mkdirSync(deps.dir, { recursive: true, mode: 0o700 });
  const workspace = mkdtempSync(join(deps.dir, "work-"));
  try {
    const cardFont =
      settings.chapterCard === null
        ? undefined
        : await resolveFont(deps.paths, settings.chapterCard.fontId);
    const plan = planRender({
      format: settings.format,
      gapSeconds: 0,
      edgeSeconds: 0,
      imageSeconds: shotSeconds,
      zoomPercent: defaultZoomPercent,
      motionStyle: defaultMotionStyle,
      images,
      output,
      edit: {
        ...(settings.transition === null ? {} : { transition: settings.transition }),
        look: settings.look,
        ...(cardFont === undefined
          ? {}
          : {
              cards: {
                // On the cut into the second still, so the transition and the card both show.
                chapters: [{ title: chapterTitle, start: shotSeconds }],
                font: { path: cardFont.path, name: cardFont.assName },
              },
            }),
      },
    });
    const edit: EditList = {
      ...plan.editList,
      ...previewFrame[settings.format],
      audio: [{ kind: "body", path: assets.narration, seconds: plan.totalSeconds }],
    };
    const captions = settings.captions;
    if (captions !== null) {
      const font = await resolveFont(deps.paths, captions.fontId);
      mkdirSync(join(workspace, "fonts"), { mode: 0o700 });
      copyFileSync(font.path, join(workspace, "fonts", `selected${font.extension}`));
      writeFileSync(
        join(workspace, "subtitles.ass"),
        serializeAss(previewCues(captions.text), {
          ...subtitleFrame(settings.format),
          fontName: font.assName,
          fontSize: captions.fontSize,
          position: captions.position,
        }),
        { mode: 0o600 },
      );
    }
    await renderSlideshow({
      bin: deps.ffmpeg,
      edit,
      output,
      burnSubtitles: captions !== null,
      cwd: workspace,
      scratch: workspace,
      signal,
      log: deps.log,
      onProgress: () => {},
    });
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

// The Shorts layout, drawn at the preview's size: the same audio cut, image timing, captions
// and headline a short gets, from the sample narration.
async function renderShortPreview(
  deps: FfmpegPreviewDeps,
  settings: StylePreviewSettings,
  short: NonNullable<StylePreviewSettings["short"]>,
  assets: SampleAssets,
  images: readonly string[],
  output: string,
  signal: AbortSignal,
): Promise<void> {
  mkdirSync(deps.dir, { recursive: true, mode: 0o700 });
  await renderShort({
    bin: deps.ffmpeg,
    timeline: [{ kind: "body", path: assets.narration, seconds: sampleNarrationSeconds }],
    start: 0,
    end: sampleNarrationSeconds,
    images,
    imageSeconds: shotSeconds,
    motionStyle: defaultMotionStyle,
    zoomPercent: defaultZoomPercent,
    words: previewWords(short.text),
    font: await resolveBoldFont(deps.paths, short.fontId),
    ...(short.title === null ? {} : { title: short.title }),
    speed: short.speed,
    frame: previewFrame[settings.format],
    output,
    scratch: deps.dir,
    signal,
    log: deps.log,
    onProgress: () => {},
  });
}

function explained(log: Log, error: unknown): StylePreviewError {
  if (error instanceof StylePreviewError) return error;
  const message = error instanceof Error ? error.message : String(error);
  if (isMissingFont(error))
    return new StylePreviewError(
      "font-missing",
      "The style preview couldn't render because the chosen caption font is no longer available; it may have been uninstalled or deleted. Choose another font under Subtitles, then press Render again.",
    );
  if (message.startsWith("Slopify could not start ffmpeg") || /\bENOENT\b/.test(message))
    return new StylePreviewError(
      "ffmpeg-missing",
      "The style preview couldn't render because ffmpeg wasn't found. Install ffmpeg, or use the Docker image, then press Render again.",
    );
  log.write("error", "style-preview.render", { detail: message });
  return new StylePreviewError(
    "render-failed",
    "The style preview couldn't render because ffmpeg stopped with an error. Press Render again; if it fails again, use Download diagnostics in Settings and report it.",
  );
}
