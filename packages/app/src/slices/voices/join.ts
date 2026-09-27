// Joining a multi-voice narration: every part is brought to one format (the speakers' voices
// may come from providers with different sample rates, which the concat demuxer would join
// wrongly), played at its speaker's pace, and followed by the gap between turns unless the
// next part continues the same turn. Hand-rolled like every ffmpeg argument list here.

export interface TurnPart {
  readonly path: string;
  // 1 plays as synthesized; `atempo` keeps the pitch.
  readonly pace: number;
  // Silence after this part: the turn gap, or 0 inside one turn.
  readonly gapAfter: number;
}

const rate = 44100;

export function turnJoinArgs(parts: readonly TurnPart[], output: string): string[] {
  const chains = parts.map((part, index) => {
    const filters = [
      `aformat=sample_fmts=fltp:sample_rates=${String(rate)}:channel_layouts=mono`,
      ...(part.pace === 1 ? [] : [`atempo=${String(part.pace)}`]),
      ...(part.gapAfter > 0 ? [`apad=pad_dur=${part.gapAfter.toFixed(3)}`] : []),
      "asetpts=PTS-STARTPTS",
    ];
    return `[${String(index)}:a]${filters.join(",")}[p${String(index)}]`;
  });
  chains.push(
    `${parts.map((_part, index) => `[p${String(index)}]`).join("")}concat=n=${String(parts.length)}:v=0:a=1[a]`,
  );
  return [
    "-hide_banner",
    "-nostdin",
    "-loglevel",
    "error",
    "-nostats",
    "-y",
    ...parts.flatMap((part) => ["-i", part.path]),
    "-filter_complex",
    chains.join(";"),
    "-map",
    "[a]",
    "-c:a",
    "libmp3lame",
    "-b:a",
    "128k",
    output,
  ];
}
