import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { extname, join, relative, sep } from "node:path";
import type { SubtitleAligner } from "../../kernel/ports/subtitles.js";
import type { StageContext } from "../../kernel/runner/index.js";
import type { StageRunResult } from "../../kernel/runner/work.js";
import { usesShortMode } from "../admission/short-mode.js";
import { masterFile, masterReport } from "../loudness/loudnorm.js";
import { type MasterReport, masterGoal } from "../loudness/model.js";
import type { PreparedOutput } from "../revisions/publication-model.js";
import { allocateAsset, discardPreparedAssets, sealAsset } from "../storage/assets.js";
import { outputPath, projectDir, renderCacheDir } from "../storage/layout.js";
import { audioExportArgs } from "../video/audio-export.js";
import { withPaths } from "../video/edit-list.js";
import { runFfmpeg } from "../video/ffmpeg.js";
import { planRender } from "../video/plan.js";
import { renderSlideshow } from "../video/slideshow.js";
import { writePortraits } from "../voices/portraits.js";
import { linesLevelled } from "./recipe-lines.js";
import { exportBed } from "./runtime-export-bed.js";
import { exportEdit } from "./runtime-export-edit.js";
import {
  type ExportSnapshot,
  exportSnapshot,
  retainedOutput,
  revisionAudio,
} from "./runtime-export-inputs.js";
import { executeShortExport } from "./runtime-export-short.js";
import { lineLevelledAudio } from "./runtime-lines.js";
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
  const audio = await revisionAudio(deps, context, view, { levelled: true });
  const wav = piece.key === "export:wav";
  if (!wav && piece.key !== "export:video")
    throw new Error(
      "Slopify hit an internal error (unknown kind of export). Try again; if it happens again, use Download diagnostics in Settings and report it.",
    );
  if (wav && audio.length === 0)
    throw new Error(
      "The audio export has nothing to export because narration is turned off for this project. Turn narration on in Edit project, then Try again.",
    );
  if (!wav && usesShortMode(view.revision.config))
    return executeShortExport(deps, context, piece, snapshot, audio);
  const filename = wav ? "audio.wav" : "video.mp4";
  const pending = allocateAsset(deps, context.work.projectId, filename);
  const prepared: PreparedOutput[] = [];
  let directory: string | undefined;
  // A multi-voice run's body narration levelled line by line (`runtime-lines.ts`), here
  // until the export is written.
  const linesDirectory = linesLevelled(view.revision.config)
    ? mkdtempSync(join(projectDir(deps.paths, context.work.projectId), "lines-"))
    : undefined;
  try {
    const sound =
      linesDirectory === undefined
        ? audio
        : await lineLevelledAudio(deps, context, view, audio, linesDirectory);
    const captions = snapshot.view.outputs.filter(
      (row) =>
        row.selected && row.available && row.state === "ready" && row.workKey === "subtitles:files",
    );
    const burn = !wav && view.revision.config.subtitles?.mode === "burn-in";
    if (burn) directory = captionDirectory(deps, context, snapshot);
    const portraits =
      directory === undefined
        ? undefined
        : writePortraits(deps.db, view.revision.config, directory);
    const mode = burn
      ? "burn-in"
      : captions.some((row) => row.output.role === "subtitles_srt") &&
          captions.some((row) => row.output.role === "subtitles_vtt")
        ? "files"
        : "off";
    const config = view.revision.config;
    const segment = (kind: "body" | "intro" | "outro") => {
      const row = sound.find((one) => one.kind === kind);
      return row?.path === null || row === undefined
        ? undefined
        : { path: row.path, seconds: row.seconds };
    };
    const images = wav ? [] : slideshowImages(deps, context, view);
    const edited = wav ? undefined : await exportEdit(deps, context, view, images);
    const bed = wav ? undefined : await exportBed(deps, context, view);
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
          edit: edited?.edit,
          bed,
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
            ...(portraits === undefined ? {} : { speakerPortraits: portraits.recorded }),
            ...(edited?.settings === undefined ? {} : { videoEdit: edited.settings }),
            ...(edited === undefined || edited.warnings.length === 0
              ? {}
              : { warnings: edited.warnings }),
          };
    if (!context.maySubmit(piece.id)) return "held";
    const onProgress = (elapsedMs: number): void =>
      context.emit({
        type: "stage.progress",
        projectId: context.work.projectId,
        stage: "video",
        // A tenth of a percent, so a two-hour render moves every few seconds, not minutes.
        current: Math.min(100, Math.round(elapsedMs / totalSeconds) / 10),
        total: 100,
      });
    // Level the volume: the audio-only file is mastered to the audio files' target, the video to
    // the video's (`loudness/model.ts`).
    const goal = masterGoal(config, plan === undefined ? "audioFiles" : "video");
    let master: MasterReport | undefined;
    if (plan === undefined) {
      const mixed = goal === undefined ? pending.absolutePath : `${pending.absolutePath}.mix.wav`;
      try {
        await runFfmpeg({
          bin: deps.ffmpeg,
          args: audioExportArgs(sound, mixed),
          signal: context.signal,
          log: deps.log,
          onProgress,
        });
        if (goal !== undefined) {
          const run = { bin: deps.ffmpeg, log: deps.log, signal: context.signal };
          await masterFile(run, mixed, `${pending.absolutePath}.master.wav`, goal, {
            sampleRate: 48000,
            channels: 2,
          });
          // The export is 16-bit PCM, as it always was.
          await runFfmpeg({
            bin: deps.ffmpeg,
            args: [
              "-hide_banner",
              "-nostdin",
              "-loglevel",
              "error",
              "-nostats",
              "-y",
              "-i",
              `${pending.absolutePath}.master.wav`,
              "-c:a",
              "pcm_s16le",
              "-f",
              "wav",
              pending.absolutePath,
            ],
            signal: context.signal,
            log: deps.log,
            onProgress: (): void => {},
          });
          master = await masterReport(run, pending.absolutePath, goal);
        }
      } finally {
        if (goal !== undefined) {
          rmSync(mixed, { force: true });
          rmSync(`${pending.absolutePath}.master.wav`, { force: true });
        }
      }
    } else
      master = await renderSlideshow({
        bin: deps.ffmpeg,
        edit: plan.editList,
        output: plan.output,
        burnSubtitles: burn,
        cwd: directory,
        ...(portraits === undefined ? {} : { portraits: portraits.overlays }),
        scratch: projectDirectory,
        cache: renderCacheDir(deps.paths, context.work.projectId),
        signal: context.signal,
        log: deps.log,
        onProgress,
        ...(goal === undefined ? {} : { master: goal }),
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
        {
          subtitlesMode: mode,
          ...(edited === undefined || edited.warnings.length === 0
            ? {}
            : { warnings: edited.warnings }),
          ...(master === undefined ? {} : { master }),
        },
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
    if (linesDirectory !== undefined) rmSync(linesDirectory, { recursive: true, force: true });
  }
}
// The project's images in slideshow order, as files.
export function slideshowImages(
  deps: ExportExecutionDeps,
  context: StageContext,
  view: ExportSnapshot["view"],
): readonly string[] {
  return view.revision.content.imageOrder.map((key) => {
    const row = view.outputs.find(
      (one) =>
        one.workKey === `image:${key}` && one.selected && one.available && one.state === "ready",
    );
    if (row === undefined)
      throw new Error(
        "The video export can't find one of the slideshow images. Use More → make it again in its section on Images (or regenerate that image in Edit project → Images), then Try again.",
      );
    return outputPath(deps.paths, context.work.projectId, row.output.path);
  });
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
      "Burned-in captions are missing their caption file or font. Use More → Render the video again in the Video section (or choose the caption font again in Edit project → Subtitles), then Try again.",
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
