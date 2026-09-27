import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import type { Log } from "../../kernel/log.js";
import type { Paths } from "../../kernel/paths.js";
import { defaultMotionStyle, defaultZoomPercent } from "../admission/rules.js";
import { isMissingFont, resolveFont } from "../fonts/index.js";
import { serializeAss } from "../subtitles/captions.js";
import { subtitleFrame } from "../subtitles/layout.js";
import type { EditList } from "../video/edit-list.js";
import { runFfmpeg } from "../video/ffmpeg.js";
import { planRender } from "../video/plan.js";
import { renderSlideshow } from "../video/slideshow.js";
import { stylePreviewSeconds } from "./schema.js";
import { type StylePreviewSettings, sampleCues } from "./settings.js";

// The preview goes through the same planner and renderer as a real video: `planRender` builds
// the edit list (motion, transitions, the Look, the chapter card), the captions are the same
// ASS script `prepareSubtitles` writes, and `renderSlideshow` encodes it clip by clip. Only the
// inputs are stand-ins: three stills and silence made locally, no provider is ever called.

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
} as const;
const stillSize = 1280;
const shotSeconds = stylePreviewSeconds / 3;
const chapterTitle = "Chapter one";

// Three stills, each a different colour story with a horizon and a light, so motion, grade
// and transitions all read. Square, so either format crops them to cover.
const stills: readonly string[] = [
  `gradients=s=${stillSize}x${stillSize}:c0=0x1d2b53:c1=0xe07a5f:x0=0:y0=0:x1=0:y1=${stillSize}:d=1,` +
    "drawbox=x=820:y=300:w=140:h=140:color=0xfff1c1@0.9:t=fill," +
    "drawbox=x=0:y=880:w=iw:h=400:color=0x14213d@0.85:t=fill",
  `gradients=s=${stillSize}x${stillSize}:c0=0x0b3d2e:c1=0x88c9a1:x0=0:y0=${stillSize}:x1=${stillSize}:y1=0:d=1,` +
    "drawbox=x=200:y=380:w=260:h=260:color=0xf4f1de@0.8:t=fill," +
    "drawbox=x=0:y=840:w=iw:h=440:color=0x081c15@0.9:t=fill",
  `gradients=s=${stillSize}x${stillSize}:c0=0x3d1e6d:c1=0xf2a65a:x0=${stillSize}:y0=0:x1=0:y1=${stillSize}:d=1,` +
    "drawbox=x=540:y=330:w=200:h=200:color=0xffd166@0.9:t=fill," +
    "drawbox=x=0:y=820:w=iw:h=460:color=0x1b0f2e@0.85:t=fill",
];

export interface FfmpegPreviewDeps {
  readonly ffmpeg: string;
  readonly paths: Paths;
  readonly log: Log;
  // Where the stills are kept and renders are worked on.
  readonly dir: string;
}

export function ffmpegStylePreview(deps: FfmpegPreviewDeps): StylePreviewRenderer {
  let samples: Promise<readonly string[]> | undefined;
  const ensureSamples = (signal: AbortSignal): Promise<readonly string[]> => {
    samples ??= makeSamples(deps, signal).catch((error: unknown) => {
      samples = undefined;
      throw error;
    });
    return samples;
  };
  return async (settings, output, signal, picture) => {
    try {
      // A real picture is shown for all three shots: the motion, the Look and the captions read
      // on it, and the transition and chapter card still show at the cuts.
      const images =
        picture === undefined ? await ensureSamples(signal) : [picture, picture, picture];
      await renderPreview(deps, settings, images, output, signal);
    } catch (error) {
      throw explained(deps.log, error);
    }
  };
}

async function makeSamples(deps: FfmpegPreviewDeps, signal: AbortSignal) {
  const folder = join(deps.dir, "samples");
  mkdirSync(folder, { recursive: true, mode: 0o700 });
  const paths: string[] = [];
  for (const [at, source] of stills.entries()) {
    const path = join(folder, `still-${String(at + 1)}.png`);
    paths.push(path);
    if (existsSync(path)) continue;
    const part = join(folder, `still-${String(at + 1)}.part.png`);
    await runFfmpeg({
      bin: deps.ffmpeg,
      args: [
        ...["-hide_banner", "-nostdin", "-loglevel", "error", "-y"],
        ...["-f", "lavfi", "-i", source, "-frames:v", "1", part],
      ],
      signal,
      log: deps.log,
      onProgress: () => {},
    });
    renameSync(part, path);
  }
  return paths;
}

async function renderPreview(
  deps: FfmpegPreviewDeps,
  settings: StylePreviewSettings,
  images: readonly string[],
  output: string,
  signal: AbortSignal,
): Promise<void> {
  // A render on a given picture never made the stills, which is what created the folder.
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
      audio: [{ kind: "gap", path: null, seconds: plan.totalSeconds }],
    };
    const captions = settings.captions;
    if (captions !== null) {
      const font = await resolveFont(deps.paths, captions.fontId);
      mkdirSync(join(workspace, "fonts"), { mode: 0o700 });
      copyFileSync(font.path, join(workspace, "fonts", `selected${font.extension}`));
      writeFileSync(
        join(workspace, "subtitles.ass"),
        serializeAss(sampleCues(captions.text, plan.totalSeconds), {
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
