import { relative } from "node:path";
import { outputPath, projectDir } from "../storage/layout.js";
import type { Output } from "../storage/model.js";
import { probeDurationMs } from "./ffmpeg.js";
import type { AudioInput } from "./plan.js";
import type { VideoDeps } from "./run.js";

export async function audioInputs(
  deps: VideoDeps,
  projectId: string,
  outputs: readonly Output[],
  signal: AbortSignal,
): Promise<{
  readonly body: AudioInput;
  readonly intro: AudioInput | undefined;
  readonly outro: AudioInput | undefined;
}> {
  const dir = projectDir(deps.paths, projectId);
  const body = await audio(deps, outputs, "audio_body", dir, signal);
  if (!body) throw new Error("the project has no narration audio to render against");
  if (body.seconds <= 0) throw new Error("the narration audio decodes to no sound");
  const intro = await audio(deps, outputs, "audio_intro", dir, signal);
  const outro = await audio(deps, outputs, "audio_outro", dir, signal);
  return { body, intro, outro };
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
