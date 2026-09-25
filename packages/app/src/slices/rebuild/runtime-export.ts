import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { extname, join, relative, sep } from "node:path";
import type { SubtitleAligner } from "../../kernel/ports/subtitles.js";
import type { StageContext } from "../../kernel/runner/index.js";
import type { StageRunResult } from "../../kernel/runner/work.js";
import type { PreparedOutput } from "../revisions/publication-model.js";
import { allocateAsset, discardPreparedAssets, sealAsset } from "../storage/assets.js";
import { outputPath, projectDir } from "../storage/layout.js";
import { audioExportArgs } from "../video/audio-export.js";
import { withPaths } from "../video/edit-list.js";
import { runFfmpeg } from "../video/ffmpeg.js";
import { planRender } from "../video/plan.js";
import { renderSlideshow } from "../video/slideshow.js";
import {
  type ExportSnapshot,
  exportSnapshot,
  retainedOutput,
  revisionAudio,
} from "./runtime-export-inputs.js";
import type { LocalExecutionDeps } from "./runtime-local.js";
import { preparedResult, preparedText, publishResult } from "./runtime-publication.js";
import type { WorkPiece } from "./work-records.js";

export interface ExportExecutionDeps extends LocalExecutionDeps {
  readonly alignSubtitles?: SubtitleAligner | undefined;
}
export async function executeExportRecipe(
  deps: ExportExecutionDeps,
  context: StageContext,
  piece: WorkPiece,
): Promise<StageRunResult> {
  if (
    deps.db
      .prepare("SELECT state FROM revision_work_pieces WHERE id=? AND work_id=?")
      .get(piece.id, context.work.workId)?.state === "done"
  )
    return "done";
  if (!context.maySubmit(piece.id)) return "held";
  context.signal.throwIfAborted();
  const snapshot = exportSnapshot(deps, context, piece);
  const { view } = snapshot;
  const audio = await revisionAudio(deps, context, view);
  const wav = piece.key === "export:wav";
  if (!wav && piece.key !== "export:video")
    throw new Error(
      "Slopify hit an internal error (unknown kind of export). Retry stage; if it happens again, use Download diagnostics in Settings and report it.",
    );
  if (wav && audio.length === 0)
    throw new Error(
      "The audio export has nothing to export because narration is turned off for this project. Turn narration on in Edit project, then Retry stage.",
    );
  const filename = wav ? "audio.wav" : "video.mp4";
  const pending = allocateAsset(deps, context.work.projectId, filename);
  const prepared: PreparedOutput[] = [];
  let directory: string | undefined;
  try {
    const captions = snapshot.view.outputs.filter(
      (row) =>
        row.selected && row.available && row.state === "ready" && row.workKey === "subtitles:files",
    );
    const burn = !wav && view.revision.config.subtitles?.mode === "burn-in";
    if (burn) directory = captionDirectory(deps, context, snapshot);
    const mode = burn
      ? "burn-in"
      : captions.some((row) => row.output.role === "subtitles_srt") &&
          captions.some((row) => row.output.role === "subtitles_vtt")
        ? "files"
        : "off";
    const config = view.revision.config;
    const segment = (kind: "body" | "intro" | "outro") => {
      const row = audio.find((one) => one.kind === kind);
      return row?.path === null || row === undefined
        ? undefined
        : { path: row.path, seconds: row.seconds };
    };
    const images = (wav ? [] : view.revision.content.imageOrder).map((key) => {
      const row = view.outputs.find(
        (one) =>
          one.workKey === `image:${key}` && one.selected && one.available && one.state === "ready",
      );
      if (row === undefined)
        throw new Error(
          "The video export can't find one of the slideshow images. Use Re-run section on Images (or regenerate that image in Edit project → Images), then Retry stage.",
        );
      return outputPath(deps.paths, context.work.projectId, row.output.path);
    });
    const plan = wav
      ? undefined
      : planRender({
          format: config.format,
          gapSeconds: config.silenceGapSeconds,
          edgeSeconds: config.edgeSilenceSeconds,
          imageSeconds: config.imageSeconds,
          zoomPercent: config.zoomPercent,
          motionStyle: config.motionStyle,
          body: segment("body"),
          intro: segment("intro"),
          outro: segment("outro"),
          images,
          output: pending.absolutePath,
        });
    const totalSeconds = plan?.totalSeconds ?? audio.reduce((sum, row) => sum + row.seconds, 0);
    const projectDirectory = projectDir(deps.paths, context.work.projectId);
    const relativePath = (path: string): string =>
      relative(projectDirectory, path).split(sep).join("/");
    const record =
      plan === undefined
        ? {
            sampleRate: 48000,
            channels: 2,
            codec: "pcm_s16le",
            gapSeconds: config.silenceGapSeconds,
            edgeSeconds: config.edgeSilenceSeconds,
            totalSeconds,
            audio: audio.map((row) => ({
              ...row,
              path: row.path === null ? null : relativePath(row.path),
            })),
            output: pending.path,
          }
        : {
            ...plan,
            output: pending.path,
            editList: withPaths(plan.editList, relativePath),
            subtitles: config.subtitles,
          };
    if (!context.maySubmit(piece.id)) return "held";
    const onProgress = (elapsedMs: number): void =>
      context.emit({
        type: "stage.progress",
        projectId: context.work.projectId,
        stage: "video",
        current: Math.min(100, Math.round(elapsedMs / (totalSeconds * 10))),
        total: 100,
      });
    if (plan === undefined)
      await runFfmpeg({
        bin: deps.ffmpeg,
        args: audioExportArgs(audio, pending.absolutePath),
        signal: context.signal,
        log: deps.log,
        onProgress,
      });
    else
      await renderSlideshow({
        bin: deps.ffmpeg,
        edit: plan.editList,
        output: plan.output,
        burnSubtitles: burn,
        cwd: directory,
        scratch: projectDirectory,
        signal: context.signal,
        log: deps.log,
        onProgress,
      });
    context.signal.throwIfAborted();
    const asset = sealAsset(deps, pending);
    prepared.push(
      preparedResult(
        deps,
        context,
        piece,
        wav ? "audio_export" : "video",
        asset,
        Math.round(totalSeconds * 1000),
        { subtitlesMode: mode },
      ),
    );
    prepared.push(
      preparedText(deps, context, piece, "render_params", "render.json", JSON.stringify(record)),
    );
    prepared.push(...captions.map((row) => retainedOutput(deps, view, row)));
    await publishResult(deps, context, piece, prepared, { totalSeconds }, asset);
    deps.count?.("stage.completed", { stage: "video" });
    return "done";
  } finally {
    discardPreparedAssets(deps, [pending, ...prepared.map((one) => one.asset)]);
    if (directory !== undefined) rmSync(directory, { recursive: true, force: true });
  }
}
function captionDirectory(
  deps: ExportExecutionDeps,
  context: StageContext,
  snapshot: ExportSnapshot,
): string {
  const find = (role: "subtitle_ass" | "subtitle_font") =>
    snapshot.view.outputs.find(
      (row) => row.selected && row.available && row.state === "ready" && row.output.role === role,
    );
  const ass = find("subtitle_ass");
  const font = find("subtitle_font");
  if (ass === undefined || font === undefined)
    throw new Error(
      "Burned-in captions are missing their caption file or font. Use Re-run section on Video (or choose the caption font again in Edit project → Subtitles), then Retry stage.",
    );
  const directory = mkdtempSync(join(projectDir(deps.paths, context.work.projectId), "render-"));
  try {
    mkdirSync(join(directory, "fonts"), { mode: 0o700 });
    copyFileSync(
      outputPath(deps.paths, context.work.projectId, ass.output.path),
      join(directory, "subtitles.ass"),
    );
    copyFileSync(
      outputPath(deps.paths, context.work.projectId, font.output.path),
      join(directory, "fonts", `selected${extname(font.output.path)}`),
    );
    return directory;
  } catch (error) {
    rmSync(directory, { recursive: true, force: true });
    throw error;
  }
}
