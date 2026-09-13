import type { AudioSegment } from "./plan.js";

const rate = 48000;

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
