import { mkdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { transact } from "../../kernel/db/tx.js";
import type { StageContext } from "../../kernel/runner/index.js";
import { setStageProgress } from "../admission/repo.js";
import { outputPath } from "../storage/layout.js";
import type { Output } from "../storage/model.js";
import { deleteOutput, insertOutput, outputsOf } from "../storage/repo.js";
import { runFfmpeg } from "./ffmpeg.js";
import type { VideoDeps } from "./run.js";

const progressIntervalMs = 500;
const renderRoles: readonly Output["role"][] = ["video", "audio_export", "render_params"];
interface ExportOutput {
  readonly role: "video" | "audio_export";
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
      signal: context.signal,
      log: deps.log,
      onProgress: (elapsedMs: number): void => {
        const at = deps.clock.now().getTime();
        if (at - announced < progressIntervalMs) {
          return;
        }
        announced = at;
        const current = Math.min(elapsedMs, totalMs);
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
    throw error;
  }

  // The swap. Everything below replaces the previous render, and nothing above it could.
  renameSync(part, target);
  const params = outputPath(deps.paths, projectId, "render.json");
  writeFileSync(params, `${JSON.stringify(output.record, null, 2)}\n`, { mode: 0o600 });
  // No version history. The files were written under the names the previous render
  // already used, so replacing the rows that named them is all that is left to do. In one
  // transaction, or a crash between the delete and the insert would leave the finished
  // export with no row and the boot reconcile would collect it. Read back rather than
  // reused from above: the rows are what a download resolves.
  transact(deps.db, () => {
    for (const previous of outputsOf(deps.db, projectId)) {
      if (renderRoles.includes(previous.role)) {
        deleteOutput(deps.db, previous.id);
      }
    }
    store(deps, projectId, "render_params", "render.json", null);
    store(deps, projectId, output.role, output.filename, totalMs);
  });
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
    meta: {},
    createdAt: deps.clock.now().toISOString(),
  });
}
