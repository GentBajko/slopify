import { relative } from "node:path";
import type { StageContext } from "../../kernel/runner/index.js";
import { projectDir } from "../storage/layout.js";
import { outputsOf } from "../storage/repo.js";
import { audioInputs } from "./audio-inputs.js";
import { type AudioSegment, audioTimeline } from "./plan.js";
import type { VideoDeps } from "./run.js";
import { writeExport } from "./write-export.js";

const rate = 48000;

export async function exportAudioWav(
  deps: VideoDeps,
  context: StageContext,
  gapSeconds: number,
): Promise<void> {
  const { projectId } = context.stage;
  const input = await audioInputs(deps, projectId, outputsOf(deps.db, projectId), context.signal);
  const audio = audioTimeline({ ...input, gapSeconds }, 1 / rate);
  const totalSeconds = audio.reduce((sum, segment) => sum + segment.seconds, 0);
  const dir = projectDir(deps.paths, projectId);
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
  };
  await writeExport(deps, context, {
    role: "audio_export",
    filename: "audio.wav",
    partName: "audio.part.wav",
    totalSeconds,
    record: plan,
    args: (part) => audioExportArgs(audio, part),
  });
}

export function audioExportArgs(audio: readonly AudioSegment[], output: string): string[] {
  const inputs = audio.flatMap((segment) =>
    segment.path === null
      ? ["-f", "lavfi", "-t", segment.seconds.toFixed(6), "-i", `anullsrc=r=${rate}:cl=stereo`]
      : ["-i", segment.path],
  );
  const chains = audio.map(
    (_segment, index) =>
      `[${index}:a]aformat=sample_fmts=s16:sample_rates=${rate}:channel_layouts=stereo,asetpts=PTS-STARTPTS[a${index}]`,
  );
  chains.push(
    `${audio.map((_segment, index) => `[a${index}]`).join("")}concat=n=${audio.length}:v=0:a=1[a]`,
  );
  return [
    "-hide_banner",
    "-nostdin",
    "-loglevel",
    "error",
    "-progress",
    "pipe:1",
    "-nostats",
    "-y",
    ...inputs,
    "-filter_complex",
    chains.join(";"),
    "-map",
    "[a]",
    "-vn",
    "-c:a",
    "pcm_s16le",
    "-ar",
    String(rate),
    "-ac",
    "2",
    "-f",
    "wav",
    output,
  ];
}
