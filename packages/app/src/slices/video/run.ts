import { mkdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, relative } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import type { Clock } from "../../kernel/clock.js";
import { transact } from "../../kernel/db/tx.js";
import type { Ids } from "../../kernel/ids.js";
import type { Log } from "../../kernel/log.js";
import type { Paths } from "../../kernel/paths.js";
import type { StageContext } from "../../kernel/runner/index.js";
import { projectById, setStageProgress } from "../admission/repo.js";
import { outputPath, projectDir } from "../storage/layout.js";
import type { Output } from "../storage/model.js";
import { deleteOutput, insertOutput, outputsOf } from "../storage/repo.js";
import type { RecordEvent } from "../telemetry/model.js";
import { probeDurationMs, renderArgs, runFfmpeg } from "./ffmpeg.js";
import type { AudioInput, RenderPlan } from "./plan.js";
import { planRender } from "./plan.js";

export interface VideoDeps {
  readonly db: DatabaseSync;
  readonly paths: Paths;
  readonly ids: Ids;
  readonly clock: Clock;
  readonly log: Log;
  readonly ffmpeg: string;
  // One event per render that finished.
  readonly count: RecordEvent;
}

// ceiling: progress is coalesced to one event per 500 ms, and the stage's progress
// columns are written on the same tick so a page that reconnects mid-render sees a bar
// rather than nothing.
const progressIntervalMs = 500;

// The previous video stays downloadable until the new render finishes. ffmpeg therefore writes
// beside the finished file rather than over it, and the swap below is what replaces it. The
// name keeps the `.mp4` extension because that is what ffmpeg picks its muxer from, and no row
// ever names it: a download resolves an outputs row, and the boot reconcile collects a part
// file left by a killed process as an orphan (`slices/storage/reconcile.ts`).
const partName = "video.part.mp4";
// The two outputs one render produces. Both are replaced together, so a project never
// carries the video of one render beside the parameters of another.
const renderRoles: readonly Output["role"][] = ["video", "render_params"];

export async function renderVideo(deps: VideoDeps, context: StageContext): Promise<void> {
  const { projectId } = context.stage;
  const project = projectById(deps.db, projectId);
  if (project === undefined) {
    throw new Error(`project ${projectId} has no row`);
  }
  const outputs = outputsOf(deps.db, projectId);
  const dir = projectDir(deps.paths, projectId);
  const target = outputPath(deps.paths, projectId, "video.mp4");

  const body = await audio(deps, outputs, "audio_body", dir, context.signal);
  if (body === undefined) {
    throw new Error("the project has no narration audio to render against");
  }
  if (body.seconds <= 0) {
    throw new Error("the narration audio decodes to no sound");
  }
  const plan = planRender({
    format: project.format,
    gapSeconds: project.config.silenceGapSeconds,
    ...withIntro(await audio(deps, outputs, "audio_intro", dir, context.signal)),
    body,
    ...withOutro(await audio(deps, outputs, "audio_outro", dir, context.signal)),
    images: slideshow(outputs).map((output) => outputPath(deps.paths, projectId, output.path)),
    output: target,
  });

  mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
  // The plan is the record of what was rendered and names the file the user downloads,
  // so it keeps the final path; only the ffmpeg invocation is pointed at the part file.
  const part = outputPath(deps.paths, projectId, partName);
  const totalMs = Math.round(plan.totalSeconds * 1000);
  let announced = 0;
  try {
    // No retry and no timeout. A render that fails is terminal.
    await runFfmpeg({
      bin: deps.ffmpeg,
      args: renderArgs({ ...plan, output: part }),
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
    // previous video is a finished output and stays downloadable.
    rmSync(part, { force: true });
    throw error;
  }

  // The swap. Everything below replaces the previous render, and nothing above it could.
  renameSync(part, target);
  const params = outputPath(deps.paths, projectId, "render.json");
  writeFileSync(params, `${JSON.stringify(recorded(plan, dir), null, 2)}\n`, { mode: 0o600 });
  // No version history. The files were written under the names the previous render
  // already used, so replacing the rows that named them is all that is left to do. In one
  // transaction, or a crash between the delete and the insert would leave the finished
  // video with no row and the boot reconcile would collect it. Read back rather than
  // reused from above: the rows are what a download resolves.
  transact(deps.db, () => {
    for (const previous of outputsOf(deps.db, projectId)) {
      if (renderRoles.includes(previous.role)) {
        deleteOutput(deps.db, previous.id);
      }
    }
    store(deps, projectId, "render_params", "render.json", null);
    store(deps, projectId, "video", "video.mp4", totalMs);
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
  // Videos rendered (completed renders). One event per swap, so a render that failed or was
  // canceled counts nothing and a re-render counts again No provider: ffmpeg is the machine's
  // own, not a service.
  deps.count("stage.completed", { stage: "video" });
}

// Written with project-relative paths, so the record of what was rendered can be read
// beside the files it names and carries no absolute path off the machine.
function recorded(plan: RenderPlan, dir: string): unknown {
  return {
    ...plan,
    audio: plan.audio.map((segment) => ({
      ...segment,
      path: segment.path === null ? null : relative(dir, segment.path),
    })),
    images: plan.images.map((slot) => ({ ...slot, path: relative(dir, slot.path) })),
    output: relative(dir, plan.output),
  };
}

// Every slideshow image appears exactly once, in slideshow order.
// The thumbnail is a different role, so it is never in this list.
function slideshow(outputs: readonly Output[]): readonly Output[] {
  return outputs
    .filter((output) => output.role === "image")
    .toSorted((left, right) => (left.meta.index ?? 0) - (right.meta.index ?? 0));
}

async function audio(
  deps: VideoDeps,
  outputs: readonly Output[],
  role: Output["role"],
  dir: string,
  signal: AbortSignal,
): Promise<AudioInput | undefined> {
  const output = outputs.find((candidate) => candidate.role === role);
  if (output === undefined) {
    return undefined;
  }
  const path = outputPath(deps.paths, output.projectId, output.path);
  const durationMs =
    output.durationMs ?? (await probeDurationMs(deps.ffmpeg, path, signal, deps.log));
  if (output.durationMs === null) {
    // A provided file arrives with no duration; measuring it once is worth recording.
    deps.db.prepare("UPDATE outputs SET duration_ms = ? WHERE id = ?").run(durationMs, output.id);
    deps.log.write("info", "video.probe", {
      projectId: output.projectId,
      stage: "video",
      detail: `${relative(dir, path)} is ${durationMs} ms`,
    });
  }
  return { path, seconds: durationMs / 1000 };
}

function withIntro(intro: AudioInput | undefined): { intro?: AudioInput } {
  return intro === undefined ? {} : { intro };
}

function withOutro(outro: AudioInput | undefined): { outro?: AudioInput } {
  return outro === undefined ? {} : { outro };
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
