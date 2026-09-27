import { relative, sep } from "node:path";
import type { StageContext } from "../../kernel/runner/index.js";
import type { StageRunResult } from "../../kernel/runner/work.js";
import { resolveBoldFont } from "../fonts/index.js";
import type { PreparedOutput } from "../revisions/publication-model.js";
import { renderShort, shortFrame } from "../shorts/render.js";
import { allocateAsset, discardPreparedAssets, sealAsset } from "../storage/assets.js";
import { projectDir } from "../storage/layout.js";
import type { AudioSegment } from "../video/edit-list.js";
import { probeDurationMs } from "../video/ffmpeg.js";
import { type ExportExecutionDeps, slideshowImages } from "./runtime-export.js";
import type { ExportSnapshot } from "./runtime-export-inputs.js";
import { preparedResult, preparedText, publishResult } from "./runtime-publication.js";
import { timingWords } from "./runtime-shorts.js";
import type { WorkPiece } from "./work-records.js";

// A short-mode project's video (`admission/short-mode.ts`): the whole narration timeline as
// one clip through the Shorts renderer, so it looks like every short Slopify cuts from a long
// video - the images moving as the project says, the title on top and big word-by-word
// captions from the word timing.
export async function executeShortExport(
  deps: ExportExecutionDeps,
  context: StageContext,
  piece: WorkPiece,
  snapshot: ExportSnapshot,
  timeline: readonly AudioSegment[],
): Promise<StageRunResult> {
  const { view } = snapshot;
  const config = view.revision.config;
  const images = slideshowImages(deps, context, view);
  const words = timingWords(deps, context, view);
  const seconds = timeline.reduce((sum, segment) => sum + segment.seconds, 0);
  if (seconds <= 0)
    throw new Error(
      "The short has no narration to play, so there is nothing to render. Let the Narration stage finish (Resume, or Try again on it), then retry this stage.",
    );
  const font = await resolveBoldFont(deps.paths, config.subtitles?.fontId ?? "default");
  if (!context.maySubmit(piece.id)) return "held";
  const pending = allocateAsset(deps, context.work.projectId, "video.mp4");
  const prepared: PreparedOutput[] = [];
  const directory = projectDir(deps.paths, context.work.projectId);
  const relativePath = (path: string): string => relative(directory, path).split(sep).join("/");
  try {
    await renderShort({
      bin: deps.ffmpeg,
      timeline,
      start: 0,
      end: seconds,
      images,
      imageSeconds: config.imageSeconds,
      motionStyle: config.motionStyle,
      zoomPercent: config.zoomPercent,
      words,
      font,
      title: config.title,
      output: pending.absolutePath,
      scratch: directory,
      signal: context.signal,
      log: deps.log,
      onProgress: (elapsedMs) =>
        context.emit({
          type: "stage.progress",
          projectId: context.work.projectId,
          stage: "video",
          current: Math.min(100, Math.round(elapsedMs / (seconds * 10))),
          total: 100,
        }),
    });
    context.signal.throwIfAborted();
    const durationMs = await probeDurationMs(
      deps.ffmpeg,
      pending.absolutePath,
      context.signal,
      deps.log,
    );
    const asset = sealAsset(deps, pending);
    prepared.push(
      preparedResult(deps, context, piece, "video", asset, durationMs, { subtitlesMode: "off" }),
    );
    prepared.push(
      preparedText(
        deps,
        context,
        piece,
        "render_params",
        "render.json",
        JSON.stringify({
          mode: "short",
          ...shortFrame,
          totalSeconds: seconds,
          imageSeconds: config.imageSeconds,
          motionStyle: config.motionStyle,
          zoomPercent: config.zoomPercent,
          images: images.map(relativePath),
          audio: timeline.map((segment) => ({
            ...segment,
            path: segment.path === null ? null : relativePath(segment.path),
          })),
          fontId: config.subtitles?.fontId ?? "default",
          output: pending.path,
        }),
      ),
    );
    await publishResult(deps, context, piece, prepared, { totalSeconds: seconds }, asset);
    deps.count?.("stage.completed", { stage: "video" });
    return "done";
  } finally {
    discardPreparedAssets(deps, [pending, ...prepared.map((one) => one.asset)]);
  }
}
