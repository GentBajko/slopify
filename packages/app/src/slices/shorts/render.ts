import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Log } from "../../kernel/log.js";
import type { TimedWord } from "../../kernel/ports/subtitles.js";
import type { MotionStyle } from "../admission/model.js";
import { type AudioSegment, type EditList, editListVersion } from "../video/edit-list.js";
import { runFfmpeg } from "../video/ffmpeg.js";
import { motionFor } from "../video/motion.js";
import { fps } from "../video/plan.js";
import { renderSlideshow } from "../video/slideshow.js";
import { fasterWords, shortCaptionsAss } from "./captions.js";

// A short is rendered in three steps. Its sound is cut out of the video's own timeline (the
// silence at the start, intro, gaps, body, outro), which is the timeline the word timing
// walked, so a clip's start and end in seconds are the same seconds in the audio. Then the
// images play as the video's slideshow does, with the project's motion, and the join burns
// the captions in through the same `ass` filter and font folder the video's captions use.

export const shortFrame = { width: 1080, height: 1920 } as const;
const sampleRate = 44100;
const channelLayout = "stereo";

export interface ShortMusic {
  readonly path: string;
  // 0-100, of the file's own level.
  readonly volume: number;
}

// ceiling: the ducking. The music dips once the narration passes about -34 dBFS, by up to
// 8:1, within 20 ms, and comes back over 400 ms after the voice stops, so it swells in the
// pauses without pumping between words. It fades in over the first second and out over the
// last two.
const duck = "threshold=0.02:ratio=8:attack=20:release=400:makeup=1";
const fadeIn = 1;
const fadeOut = 2;

// The segments of the timeline the clip overlaps, joined and trimmed to the clip at the
// sample, as a WAV the slideshow's join plays under the images. At a speed above 1 the
// narration is played faster with its pitch kept (`atempo`); with music, the file is looped
// to the clip's length, faded in and out, and mixed under the narration, dipping while it
// speaks.
export function shortAudioArgs(
  timeline: readonly AudioSegment[],
  start: number,
  end: number,
  output: string,
  options: { readonly speed?: number | undefined; readonly music?: ShortMusic | undefined } = {},
): string[] {
  const inputs: string[] = [];
  const chains: string[] = [];
  let offset = 0;
  let first: number | undefined;
  let count = 0;
  for (const segment of timeline) {
    const from = offset;
    offset += segment.seconds;
    if (offset <= start || from >= end) continue;
    first ??= from;
    if (segment.path === null)
      inputs.push(
        "-f",
        "lavfi",
        "-t",
        segment.seconds.toFixed(6),
        "-i",
        `anullsrc=r=${String(sampleRate)}:cl=${channelLayout}`,
      );
    else inputs.push("-i", segment.path);
    chains.push(
      `[${String(count)}:a]aformat=sample_fmts=fltp:sample_rates=${String(sampleRate)}:channel_layouts=${channelLayout}[a${String(count)}]`,
    );
    count += 1;
  }
  if (count === 0 || first === undefined)
    throw new Error(
      "A short's clip falls outside the narration, so it has no sound to cut. Use Pick different moments in Edit project → Shorts, then Try again.",
    );
  const joined = Array.from({ length: count }, (_value, at) => `[a${String(at)}]`).join("");
  chains.push(`${joined}concat=n=${String(count)}:v=0:a=1[joined]`);
  const speed = options.speed ?? 1;
  const music = options.music;
  const trimmed = `[joined]atrim=start=${(start - first).toFixed(6)}:end=${(end - first).toFixed(6)},asetpts=PTS-STARTPTS`;
  const tempo = speed === 1 ? "" : `,atempo=${speed.toFixed(4)}`;
  if (music === undefined) chains.push(`${trimmed}${tempo}[a]`);
  else {
    const seconds = (end - start) / speed;
    const out = Math.max(0, seconds - fadeOut);
    // Looped endlessly and cut to the clip, so a file shorter than the short plays again.
    inputs.push("-stream_loop", "-1", "-i", music.path);
    chains.push(`${trimmed}${tempo},asplit=2[voice][key]`);
    chains.push(
      `[${String(count)}:a]aformat=sample_fmts=fltp:sample_rates=${String(sampleRate)}:channel_layouts=${channelLayout},atrim=end=${seconds.toFixed(6)},asetpts=PTS-STARTPTS,volume=${(music.volume / 100).toFixed(4)},afade=t=in:st=0:d=${String(fadeIn)},afade=t=out:st=${out.toFixed(6)}:d=${String(fadeOut)}[bed]`,
    );
    chains.push(`[bed][key]sidechaincompress=${duck}[ducked]`);
    // The narration keeps its level; `normalize=0` stops amix halving both.
    chains.push("[voice][ducked]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[a]");
  }
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
    "-c:a",
    "pcm_s16le",
    output,
  ];
}

// The images each hold `imageSeconds` in order, the last one running to the end of the clip,
// moving as the video's shots move by their place.
export function shortEditList(input: {
  readonly audioPath: string;
  readonly seconds: number;
  readonly images: readonly string[];
  readonly imageSeconds: number;
  readonly motionStyle: MotionStyle;
  readonly zoomPercent: number;
}): EditList {
  if (input.images.length === 0)
    throw new Error(
      "A short has no images to show. Use Make this short again in Edit project → Shorts, then Try again.",
    );
  const total = Math.max(1, Math.round(input.seconds * fps));
  const each = Math.max(1, Math.round(input.imageSeconds * fps));
  const images = input.images.slice(0, Math.max(1, Math.ceil(total / each)));
  const shots = images.flatMap((path, at) => {
    const frames = at < images.length - 1 ? each : total - each * (images.length - 1);
    return frames > 0
      ? [
          {
            source: { kind: "image" as const, path },
            frames,
            motion: motionFor(input.motionStyle, at, input.zoomPercent),
          },
        ]
      : [];
  });
  return {
    version: editListVersion,
    ...shortFrame,
    fps,
    audio: [{ kind: "body", path: input.audioPath, seconds: input.seconds }],
    shots,
  };
}

export interface ShortRender {
  readonly bin: string;
  readonly timeline: readonly AudioSegment[];
  readonly start: number;
  readonly end: number;
  // Absolute paths, in the order they are shown.
  readonly images: readonly string[];
  readonly imageSeconds: number;
  readonly motionStyle: MotionStyle;
  readonly zoomPercent: number;
  // On the clip's own timeline (`clipWords`).
  readonly words: readonly TimedWord[];
  readonly font: { readonly path: string; readonly extension: string; readonly assName: string };
  // Drawn as a headline for the whole short when given.
  readonly title?: string | undefined;
  // 1-1.25; everything on the clip's timeline plays this much faster.
  readonly speed?: number | undefined;
  readonly music?: ShortMusic | undefined;
  readonly output: string;
  // Where the working folder is made; it is removed however the render ends.
  readonly scratch: string;
  readonly signal: AbortSignal;
  readonly log: Log;
  readonly onProgress: (elapsedMs: number) => void;
}

export async function renderShort(run: ShortRender): Promise<void> {
  const speed = run.speed ?? 1;
  // The images keep their share of what is said, so at a higher speed each is on screen
  // for less time and the count stays the one the prompts were written for.
  const seconds = (run.end - run.start) / speed;
  const workspace = mkdtempSync(join(run.scratch, "short-"));
  try {
    const audio = join(workspace, "clip.wav");
    await runFfmpeg({
      bin: run.bin,
      args: shortAudioArgs(run.timeline, run.start, run.end, audio, {
        speed,
        music: run.music,
      }),
      signal: run.signal,
      log: run.log,
      onProgress: () => undefined,
    });
    writeFileSync(
      join(workspace, "subtitles.ass"),
      shortCaptionsAss(fasterWords(run.words, speed), {
        ...shortFrame,
        fontName: run.font.assName,
        ...(run.title === undefined ? {} : { title: { text: run.title, seconds } }),
      }),
      { mode: 0o600 },
    );
    mkdirSync(join(workspace, "fonts"), { mode: 0o700 });
    copyFileSync(run.font.path, join(workspace, "fonts", `selected${run.font.extension}`));
    await renderSlideshow({
      bin: run.bin,
      edit: shortEditList({
        audioPath: audio,
        seconds,
        images: run.images,
        imageSeconds: run.imageSeconds / speed,
        motionStyle: run.motionStyle,
        zoomPercent: run.zoomPercent,
      }),
      output: run.output,
      burnSubtitles: true,
      cwd: workspace,
      scratch: workspace,
      signal: run.signal,
      log: run.log,
      onProgress: run.onProgress,
    });
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}
