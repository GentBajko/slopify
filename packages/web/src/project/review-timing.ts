import { captionCues } from "@app/slices/subtitles/captions.js";
import { audioTimeline } from "@app/slices/video/plan.js";
import { z } from "zod";

// The narration's word timing (`subtitles.json`) as lines to follow along with: each line a
// caption cue's words on one line, timed on the whole narration timeline (lead-in, intro, gaps,
// body, outro), with the speaker of a multi-voice run.

const timingSchema = z.object({
  words: z.array(
    z.object({
      text: z.string(),
      start: z.number().finite().nonnegative(),
      end: z.number().finite().positive(),
      speaker: z.string().min(1).optional(),
    }),
  ),
});

export interface TimedLine {
  readonly start: number;
  readonly end: number;
  readonly text: string;
  readonly speaker?: string | undefined;
}

// The lines of a timing file, or none when it is missing, damaged or empty.
export function timedLines(text: string | undefined): readonly TimedLine[] {
  if (text === undefined || text.trim() === "") return [];
  try {
    const parsed = timingSchema.safeParse(JSON.parse(text));
    if (!parsed.success) return [];
    const words = parsed.data.words.filter((word) => word.text.trim() !== "");
    return captionCues(words).map((cue) => ({
      start: cue.start,
      end: cue.end,
      text: cue.text.replace(/\s*\n\s*/g, " "),
      ...(cue.speaker === undefined ? {} : { speaker: cue.speaker }),
    }));
  } catch {
    return [];
  }
}

export type SpokenSegment = "intro" | "body" | "outro";

// Where each spoken segment starts on the narration timeline, laid out the way the video and
// the captions lay it out (`video/plan.ts` audioTimeline). Undefined without the body's length.
export function segmentStarts(input: {
  readonly edgeSeconds: number;
  readonly gapSeconds: number;
  readonly seconds: Partial<Record<SpokenSegment, number>>;
}): Partial<Record<SpokenSegment, number>> | undefined {
  const body = input.seconds.body;
  if (body === undefined || body <= 0) return undefined;
  const of = (kind: SpokenSegment) => {
    const seconds = input.seconds[kind];
    return seconds === undefined || seconds <= 0 ? undefined : { path: kind, seconds };
  };
  const intro = of("intro");
  const outro = of("outro");
  const timeline = audioTimeline({
    edgeSeconds: input.edgeSeconds,
    gapSeconds: input.gapSeconds,
    body: { path: "body", seconds: body },
    ...(intro === undefined ? {} : { intro }),
    ...(outro === undefined ? {} : { outro }),
  });
  const starts: Partial<Record<SpokenSegment, number>> = {};
  let at = 0;
  for (const segment of timeline) {
    if (segment.kind === "intro" || segment.kind === "body" || segment.kind === "outro")
      starts[segment.kind] = at;
    at += segment.seconds;
  }
  return starts;
}

// A line's segment and its time within that segment's own file.
export function placeLine(
  line: TimedLine,
  starts: Partial<Record<SpokenSegment, number>>,
  seconds: Partial<Record<SpokenSegment, number>>,
): { readonly segment: SpokenSegment; readonly start: number; readonly end: number } | undefined {
  for (const segment of ["intro", "body", "outro"] as const) {
    const from = starts[segment];
    const length = seconds[segment];
    if (from === undefined || length === undefined) continue;
    const middle = (line.start + line.end) / 2;
    if (middle >= from && middle <= from + length)
      return {
        segment,
        start: Math.max(0, line.start - from),
        end: Math.min(length, line.end - from),
      };
  }
  return undefined;
}

// The line playing at `seconds`: the last one started, held through the pause after it.
export function lineAt(
  lines: readonly { readonly start: number; readonly end: number }[],
  seconds: number,
): number {
  let found = -1;
  for (const [index, line] of lines.entries()) {
    if (line.start <= seconds + 0.05) found = index;
    else break;
  }
  return found;
}

const plain = (text: string): string[] =>
  text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((word) => word !== "");

// Which narration chunk a line was spoken from: the first chunk whose words hold the line's
// opening words in order. The spoken text can differ slightly from the chunk (numbers read
// out), so it tries the first five words, then the first three.
export function chunkOfLine(
  chunks: readonly { readonly text: string }[],
  line: string,
  from = 0,
): number | undefined {
  const words = plain(line);
  if (words.length === 0) return undefined;
  const texts = chunks.map((chunk) => ` ${plain(chunk.text).join(" ")} `);
  for (const size of [5, 3]) {
    const needle = ` ${words.slice(0, size).join(" ")} `;
    for (let index = from; index < texts.length; index++)
      if (texts[index]?.includes(needle)) return index;
    for (let index = 0; index < Math.min(from, texts.length); index++)
      if (texts[index]?.includes(needle)) return index;
  }
  return undefined;
}
