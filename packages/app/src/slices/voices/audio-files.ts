import type { AudioSegment } from "../video/edit-list.js";

// The listening files of a multi-voice run: an MP3 and an M4B (AAC in an MP4 container, the
// audiobook convention) of the same timeline the video plays - edge silence, intro, body,
// outro - with a chapter at each section of the script. ffmpeg reads the chapters from an
// FFMETADATA file and writes them as ID3 CHAP frames in the MP3 and chapter atoms in the M4B.

export interface Chapter {
  readonly title: string;
  readonly startMs: number;
  readonly endMs: number;
}

// One chapter per script section that was heard, each running to the next; the first starts
// at zero so the lead-in and intro belong to it. A script without sections is one chapter.
export function audioChapters(input: {
  readonly title: string;
  readonly sections: readonly { readonly title: string; readonly firstTurn: number }[];
  readonly turnStarts: ReadonlyMap<number, number>;
  readonly totalSeconds: number;
}): readonly Chapter[] {
  const totalMs = Math.max(1, Math.round(input.totalSeconds * 1000));
  const points: { title: string; startMs: number }[] = [];
  for (const section of input.sections) {
    const start = input.turnStarts.get(section.firstTurn);
    if (start === undefined) continue;
    const startMs = points.length === 0 ? 0 : Math.round(start * 1000);
    const last = points.at(-1);
    // Two sections starting at the same moment (an empty one) keep the later title.
    if (last !== undefined && startMs <= last.startMs) {
      points[points.length - 1] = { title: section.title, startMs: last.startMs };
      continue;
    }
    if (startMs >= totalMs) continue;
    points.push({ title: section.title, startMs });
  }
  if (points.length === 0) points.push({ title: input.title, startMs: 0 });
  return points.map((point, at) => ({
    title: point.title,
    startMs: point.startMs,
    endMs: points[at + 1]?.startMs ?? totalMs,
  }));
}

// FFMETADATA1: `=`, `;`, `#`, `\` and line breaks are escaped with a backslash.
export function ffmetadata(title: string, chapters: readonly Chapter[]): string {
  const lines = [";FFMETADATA1", `title=${escapeMeta(title)}`];
  for (const chapter of chapters)
    lines.push(
      "",
      "[CHAPTER]",
      "TIMEBASE=1/1000",
      `START=${String(chapter.startMs)}`,
      `END=${String(chapter.endMs)}`,
      `title=${escapeMeta(chapter.title)}`,
    );
  return `${lines.join("\n")}\n`;
}
function escapeMeta(text: string): string {
  return text.replace(/[=;#\\\n]/g, (character) => `\\${character === "\n" ? "\n" : character}`);
}

export type AudioFileKind = "mp3" | "m4b";
const rate = 44100;

export function audioFileArgs(
  audio: readonly Pick<AudioSegment, "path" | "seconds">[],
  metadataPath: string,
  output: string,
  kind: AudioFileKind,
): string[] {
  const inputs = audio.flatMap((segment) =>
    segment.path === null
      ? [
          "-f",
          "lavfi",
          "-t",
          segment.seconds.toFixed(6),
          "-i",
          `anullsrc=r=${String(rate)}:cl=stereo`,
        ]
      : ["-i", segment.path],
  );
  const metadataInput = audio.length;
  const chains = audio.map(
    (_segment, index) =>
      `[${String(index)}:a]aformat=sample_fmts=fltp:sample_rates=${String(rate)}:channel_layouts=stereo,asetpts=PTS-STARTPTS[a${String(index)}]`,
  );
  chains.push(
    `${audio.map((_segment, index) => `[a${String(index)}]`).join("")}concat=n=${String(audio.length)}:v=0:a=1[a]`,
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
    "-f",
    "ffmetadata",
    "-i",
    metadataPath,
    "-filter_complex",
    chains.join(";"),
    "-map",
    "[a]",
    "-map_metadata",
    String(metadataInput),
    "-map_chapters",
    String(metadataInput),
    "-vn",
    ...(kind === "mp3"
      ? ["-c:a", "libmp3lame", "-b:a", "128k", "-id3v2_version", "3", "-f", "mp3"]
      : ["-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", "-f", "mp4"]),
    output,
  ];
}
