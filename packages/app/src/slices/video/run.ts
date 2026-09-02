import { mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, relative } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import type { Clock } from "../../kernel/clock.js";
import type { Ids } from "../../kernel/ids.js";
import type { Log } from "../../kernel/log.js";
import type { Paths } from "../../kernel/paths.js";
import type { StageContext } from "../../kernel/runner/index.js";
import { projectById, setStageProgress } from "../admission/repo.js";
import { outputPath, projectDir } from "../storage/layout.js";
import type { Output } from "../storage/model.js";
import { insertOutput, outputsOf } from "../storage/repo.js";
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
}

// ceiling: progress is coalesced to one event per 500 ms, and the stage's progress
// columns are written on the same tick so a page that reconnects mid-render sees a bar
// rather than nothing (04-data-flow, SSE disconnect).
const progressIntervalMs = 500;

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
  const totalMs = Math.round(plan.totalSeconds * 1000);
  let announced = 0;
  try {
    // logic/11 §Q89: no retry and no timeout. A render that fails is terminal.
    await runFfmpeg({
      bin: deps.ffmpeg,
      args: renderArgs(plan),
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
    // logic/13 §Q113 protects an output that was already stored, not one that is about to
    // be. A cancel landing between ffmpeg exiting and the rows below discards the render
    // rather than reporting done to a page that pressed Cancel.
    context.signal.throwIfAborted();
  } catch (error) {
    // logic/13 step 2: a partial render file is discarded, never kept or served.
    rmSync(target, { force: true });
    throw error;
  }

  const params = outputPath(deps.paths, projectId, "render.json");
  writeFileSync(params, `${JSON.stringify(recorded(plan, dir), null, 2)}\n`, { mode: 0o600 });
  store(deps, projectId, "render_params", "render.json", null);
  store(deps, projectId, "video", "video.mp4", totalMs);
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

// Written with project-relative paths, so the record of what was rendered can be read
// beside the files it names and carries no absolute path off the machine (logic/11 §Q100).
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

// logic/11 invariant: every slideshow image appears exactly once, in slideshow order.
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
