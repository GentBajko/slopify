import { relative } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import type { Clock } from "../../kernel/clock.js";
import type { Ids } from "../../kernel/ids.js";
import type { Log } from "../../kernel/log.js";
import type { Paths } from "../../kernel/paths.js";
import type { StageContext } from "../../kernel/runner/index.js";
import { projectById } from "../admission/repo.js";
import { outputPath, projectDir } from "../storage/layout.js";
import type { Output } from "../storage/model.js";
import { outputsOf } from "../storage/repo.js";
import type { RecordEvent } from "../telemetry/model.js";
import { exportAudioWav } from "./audio-export.js";
import { audioInputs } from "./audio-inputs.js";
import { renderArgs } from "./ffmpeg.js";
import type { RenderPlan } from "./plan.js";
import { planRender } from "./plan.js";
import { writeExport } from "./write-export.js";

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

export async function renderVideo(deps: VideoDeps, context: StageContext): Promise<void> {
  const { projectId } = context.stage;
  const project = projectById(deps.db, projectId);
  if (!project) throw new Error(`project ${projectId} has no row`);
  if (project.config.sources.video === "off") {
    if (project.config.sources.audio === "off")
      throw new Error("the project has no media export enabled");
    await exportAudioWav(deps, context, project.config.silenceGapSeconds);
    return;
  }
  const outputs = outputsOf(deps.db, projectId);
  const dir = projectDir(deps.paths, projectId);
  const narration =
    project.config.sources.audio === "off"
      ? {}
      : await audioInputs(deps, projectId, outputs, context.signal);
  const plan = planRender({
    format: project.format,
    gapSeconds: project.config.silenceGapSeconds,
    ...narration,
    images: slideshow(outputs).map((output) => outputPath(deps.paths, projectId, output.path)),
    output: outputPath(deps.paths, projectId, "video.mp4"),
  });
  await writeExport(deps, context, {
    role: "video",
    filename: "video.mp4",
    partName: "video.part.mp4",
    totalSeconds: plan.totalSeconds,
    record: recorded(plan, dir),
    args: (part) => renderArgs({ ...plan, output: part }),
  });
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
