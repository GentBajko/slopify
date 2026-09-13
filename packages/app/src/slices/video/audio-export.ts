import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { relative } from "node:path";
import type { StageContext } from "../../kernel/runner/index.js";
import { outputPath, projectDir } from "../storage/layout.js";
import { outputsOf } from "../storage/repo.js";
import { prepareSubtitles } from "../subtitles/prepare.js";
import { audioExportArgs } from "./audio-export-args.js";
import { audioInputs } from "./audio-inputs.js";
import { audioTimeline } from "./plan.js";
import { reusableAudioExport } from "./reuse-audio.js";
import type { VideoDeps } from "./run.js";
import { writeExport } from "./write-export.js";
import { writeSubtitles } from "./write-subtitles.js";

export { audioExportArgs } from "./audio-export-args.js";

const rate = 48000;

export async function exportAudioWav(
  deps: VideoDeps,
  context: StageContext,
  gapSeconds: number,
): Promise<void> {
  const { projectId } = context.stage;
  const outputs = outputsOf(deps.db, projectId);
  const input = await audioInputs(deps, projectId, outputs, context.signal);
  const audio = audioTimeline({ ...input, gapSeconds }, 1 / rate);
  const totalSeconds = audio.reduce((sum, segment) => sum + segment.seconds, 0);
  const dir = projectDir(deps.paths, projectId);
  const sources = outputs.filter((output) =>
    ["audio_body", "audio_intro", "audio_outro"].includes(output.role),
  );
  const plan = {
    sampleRate: rate,
    channels: 2,
    codec: "pcm_s16le",
    gapSeconds,
    totalSeconds,
    audio: audio.map((segment) => ({
      ...segment,
      path: segment.path === null ? null : relative(dir, segment.path),
    })),
    output: "audio.wav",
    sourceIds: sources.map((output) => output.id),
    sourceHashes: sources.map((output) => ({
      id: output.id,
      sha256: createHash("sha256")
        .update(readFileSync(outputPath(deps.paths, projectId, output.path)))
        .digest("hex"),
    })),
  };
  const existing = reusableAudioExport(deps.paths, projectId, outputs, plan);
  const subtitles = await prepareSubtitles(deps, context, audio, { width: 1920, height: 1080 });
  if (existing !== undefined) {
    writeSubtitles(deps, context, existing, subtitles);
    return;
  }
  await writeExport(deps, context, {
    role: "audio_export",
    filename: "audio.wav",
    partName: "audio.part.wav",
    totalSeconds,
    record: plan,
    subtitles,
    args: (part) => audioExportArgs(audio, part),
  });
}
