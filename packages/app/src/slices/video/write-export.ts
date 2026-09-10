import {
  copyFileSync,
  existsSync,
  mkdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import { transact } from "../../kernel/db/tx.js";
import type { StageContext } from "../../kernel/runner/index.js";
import { setStageProgress } from "../admission/repo.js";
import { outputPath } from "../storage/layout.js";
import type { Output } from "../storage/model.js";
import { deleteOutput, insertOutput, outputsOf } from "../storage/repo.js";
import { type PreparedSubtitles, subtitleRoles } from "../subtitles/prepare.js";
import { runFfmpeg } from "./ffmpeg.js";
import type { VideoDeps } from "./run.js";

const progressIntervalMs = 500;
const renderRoles: readonly Output["role"][] = [
  "video",
  "audio_export",
  "render_params",
  ...subtitleRoles,
];
interface ExportOutput {
  readonly role: "video" | "audio_export";
  readonly subtitles?: PreparedSubtitles | undefined;
  readonly filename: string;
  readonly partName: string;
  readonly totalSeconds: number;
  readonly record: unknown;
  readonly args: (part: string) => readonly string[];
}

// Both local exports retain the previous finished asset until ffmpeg succeeds and
// the abort check passes. The part file keeps its muxer's filename extension.
export async function writeExport(
  deps: VideoDeps,
  context: StageContext,
  output: ExportOutput,
): Promise<void> {
  const { projectId } = context.stage;
  const target = outputPath(deps.paths, projectId, output.filename);
  mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
  // The plan is the record of what was rendered and names the file the user downloads,
  // so it keeps the final path; only the ffmpeg invocation is pointed at the part file.
  const part = outputPath(deps.paths, projectId, output.partName);
  const totalMs = Math.round(output.totalSeconds * 1000);
  let announced = 0;
  try {
    // No retry and no timeout. A render that fails is terminal.
    await runFfmpeg({
      bin: deps.ffmpeg,
      args: output.args(part),
      cwd: output.subtitles?.directory,
      signal: context.signal,
      log: deps.log,
      onProgress: (elapsedMs: number): void => {
        const at = deps.clock.now().getTime();
        if (at - announced < progressIntervalMs) {
          return;
        }
        announced = at;
        const current =
          output.subtitles === undefined
            ? Math.min(elapsedMs, totalMs)
            : Math.round((0.35 + 0.65 * Math.min(elapsedMs / totalMs, 1)) * totalMs);
        setStageProgress(deps.db, context.stage.id, current, totalMs);
        context.emit({
          type: "stage.progress",
          projectId,
          stage: "video",
          current,
          total: totalMs,
        });
      },
    });
    // A cancel protects an output that was already stored, not one about to be. One
    // landing between ffmpeg exiting and the rows below discards the render rather than
    // reporting done to a page that pressed Cancel.
    context.signal.throwIfAborted();
  } catch (error) {
    // A partial render file is discarded, never kept or served. Only the part file: the
    // previous export is a finished output and stays downloadable.
    rmSync(part, { force: true });
    if (output.subtitles !== undefined)
      rmSync(output.subtitles.directory, { recursive: true, force: true });
    throw error;
  }

  const params = outputPath(deps.paths, projectId, "render.json");
  const previousOutputs = outputsOf(deps.db, projectId);
  const replaced: { path: string; backup: string; existed: boolean; swapped: boolean }[] = [];
  const paramsPart = outputPath(deps.paths, projectId, "render.part.json");
  let committed = false;
  try {
    writeFileSync(paramsPart, `${JSON.stringify(output.record, null, 2)}\n`, { mode: 0o600 });
    // The DB commit can fail after ffmpeg succeeds. Keep rollback copies until all
    // media, caption and font rows commit, so a failed export keeps its old playback.
    for (const path of [target, params]) {
      const saved = { path, backup: `${path}.previous`, existed: existsSync(path), swapped: false };
      if (saved.existed) copyFileSync(path, saved.backup);
      replaced.push(saved);
    }
    for (const saved of replaced) {
      renameSync(saved.path === target ? part : paramsPart, saved.path);
      saved.swapped = true;
    }
    transact(deps.db, () => {
      for (const previous of previousOutputs) {
        if (renderRoles.includes(previous.role)) deleteOutput(deps.db, previous.id);
      }
      store(deps, projectId, "render_params", "render.json", null);
      store(deps, projectId, output.role, output.filename, totalMs, {
        ...(output.subtitles?.omissions?.length
          ? { subtitleOmissions: output.subtitles.omissions }
          : {}),
        subtitlesMode:
          output.subtitles === undefined ? "off" : output.subtitles.burnIn ? "burn-in" : "files",
      });
      for (const asset of output.subtitles?.assets ?? [])
        store(deps, projectId, asset.role, asset.path, null);
    });
    committed = true;
  } catch (error) {
    for (const saved of replaced) {
      if (!saved.swapped) continue;
      if (saved.existed) renameSync(saved.backup, saved.path);
      else rmSync(saved.path, { force: true });
      saved.swapped = false;
    }
    rmSync(part, { force: true });
    rmSync(paramsPart, { force: true });
    if (output.subtitles !== undefined)
      rmSync(output.subtitles.directory, { recursive: true, force: true });
    throw error;
  } finally {
    for (const saved of replaced) {
      if (!committed && saved.swapped) continue;
      try {
        rmSync(saved.backup, { force: true });
      } catch {
        /* A retained backup is collected at the next boot. */
      }
    }
  }
  const kept = new Set(outputsOf(deps.db, projectId).map((one) => one.path));
  for (const previous of previousOutputs) {
    if (renderRoles.includes(previous.role) && !kept.has(previous.path)) {
      try {
        rmSync(outputPath(deps.paths, projectId, previous.path), { force: true });
      } catch {
        /* Boot reconciliation collects a file that could not be removed. */
      }
    }
  }
  // Written as well as emitted: a page opened after the render reads the row, and the
  // throttled in-flight writes would have left it frozen short of the end.
  setStageProgress(deps.db, context.stage.id, totalMs, totalMs);
  context.emit({
    type: "stage.progress",
    projectId,
    stage: "video",
    current: totalMs,
    total: totalMs,
  });
}

function store(
  deps: VideoDeps,
  projectId: string,
  role: Output["role"],
  path: string,
  durationMs: number | null,
  meta: Output["meta"] = {},
): void {
  insertOutput(deps.db, {
    id: deps.ids.next(),
    projectId,
    stageKind: "video",
    role,
    path,
    originalFilename: null,
    bytes: statSync(outputPath(deps.paths, projectId, path)).size,
    durationMs,
    meta,
    createdAt: deps.clock.now().toISOString(),
  });
}
