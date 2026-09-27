import { spawn } from "node:child_process";
import { isAbsolute, resolve as resolvePath } from "node:path";
import type { Log } from "../../kernel/log.js";
import { bedChains, bedInputs } from "./ambient-mix.js";
import type { EditList, Motion, Shot, TransitionStyle } from "./edit-list.js";
import { gradeFilter, lookChain, lookEncoding, placed } from "./look.js";
import { decimal, zoomRange } from "./plan.js";
import { type Segment, segments, transitionHalves } from "./transitions.js";

// Hand-rolled per the standards: the filtergraph is the load-bearing part of this slice
// and a wrapper would hide it. Every value goes into an argument array, never a shell
// string, so a title or a filename cannot become a command.

// zoompan works on a still that has been pre-scaled, because it steps the zoom in
// sub-pixel increments and a source at output resolution visibly jitters where the zoom is
// meant to be smooth and linear. A pan steps its crop window in whole source pixels, so
// the same four times gives it quarter-pixel steps on screen. Four times the frame is
// enough at 122.5%.
const prescale = 4;
const sampleRate = 44100;
const channelLayout = "stereo";

// `bundled` is ffmpeg-static's export. It is typed as unknown because the package is
// CommonJS with `module.exports = <path or null>` while its shipped .d.ts declares an ES
// default, which node16 resolution cannot map onto one another; narrowing here is
// cheaper and more honest than overriding someone else's types.
export function resolveFfmpeg(
  env: Readonly<Record<string, string | undefined>>,
  bundled: unknown,
): string {
  const override = env.SLOPIFY_FFMPEG?.trim();
  if (override !== undefined && override !== "") {
    return override;
  }
  if (typeof bundled === "string" && bundled !== "") {
    return bundled;
  }
  // Never PATH: a Slopify that quietly rendered with whichever ffmpeg the machine
  // happens to carry would not be testing the binary it ships with.
  throw new Error(
    "Slopify can't find ffmpeg, the tool it uses to make audio and video: its bundled copy is " +
      "missing for this computer. Reinstall Slopify, or set the SLOPIFY_FFMPEG environment " +
      "variable to the path of an ffmpeg program.",
  );
}

// The slideshow is rendered in two steps rather than one filtergraph. A graph with one
// scale-and-zoompan chain per shot keeps each chain's frame buffers until the graph closes,
// so its memory grows with the shot count: measured with ffmpeg 7, 200 shots peaked at
// 16 GB and ran 6,000 threads, and a 3-hour video at 15 s per image has 720 shots. So each
// distinct clip (one still, one motion, one length) is encoded once, in its own short
// ffmpeg run with a single input, and the concat demuxer then joins the clips in shot
// order from a list file. Memory is one clip's worth whatever the length; the command
// lines stay a few hundred characters (Windows allows 32,767) because the timeline lives
// in the list, not the arguments; and a still that comes round with the same motion costs
// no second zoompan. The clips are identical encodes, so without burned-in captions the
// join copies them rather than encoding again.
//
// A transition is one more clip in the list (`transitions.ts`), and the Look is filters on
// each clip (`look.ts`), so neither changes how the render runs: still one clip at a time,
// still a concat join.
export interface SlideshowClip {
  // Named by its place in the list: `c1.mp4`, `c2.mp4`, ...
  readonly name: string;
  readonly segment: Segment;
  // The shot the clip plays; for a transition, the shot it enters.
  readonly shot: Shot;
  readonly frames: number;
}

export interface SlideshowClips {
  // One per distinct clip.
  readonly clips: readonly SlideshowClip[];
  // The clip each segment of the timeline plays, in timeline order.
  readonly order: readonly string[];
}

export function slideshowClips(
  edit: Pick<EditList, "shots"> & Partial<Pick<EditList, "look" | "cards">>,
): SlideshowClips {
  const clips: SlideshowClip[] = [];
  const named = new Map<string, string>();
  const order = segments(edit.shots).map((segment) => {
    const key = clipKey(edit, segment);
    let name = named.get(key);
    if (name === undefined) {
      name = `c${clips.length + 1}.mp4`;
      named.set(key, name);
      const shot = edit.shots[segment.kind === "shot" ? segment.shot : segment.to];
      if (shot === undefined)
        throw new Error(
          "Slopify hit an internal error (the video's edit list lost a shot). Use More → Render the video again in the Video section; if it happens again, use Download diagnostics in Settings and report it.",
        );
      clips.push({ name, segment, shot, frames: segment.count });
    }
    return name;
  });
  return { clips, order };
}

// What makes two clips the same encode. The motion is plain data built in a fixed key order,
// so equal motions stringify alike. A whole shot keeps the key it always had, so an edit
// list without transitions or a Look dedupes exactly as before.
function clipKey(
  edit: Pick<EditList, "shots"> & Partial<Pick<EditList, "look" | "cards">>,
  segment: Segment,
): string {
  const at = placed(edit, segment.start, segment.count) ? segment.start : null;
  if (segment.kind === "transition") {
    const from = edit.shots[segment.from];
    const to = edit.shots[segment.to];
    return JSON.stringify([
      "transition",
      from?.source,
      from?.motion,
      from?.frames,
      to?.source,
      to?.motion,
      to?.frames,
      to?.transition,
      at,
    ]);
  }
  const shot = edit.shots[segment.shot];
  const whole = segment.from === 0 && segment.count === shot?.frames;
  return JSON.stringify(
    whole && at === null
      ? [shot?.source, shot?.motion, shot?.frames]
      : [shot?.source, shot?.motion, shot?.frames, segment.from, segment.count, at],
  );
}

// Clips that are joined by copying get the final encode's settings. Clips that will be
// decoded again under burned-in captions are kept closer to the source, so the second
// encode is not a visible second generation.
const intermediateCrf = "16";

// A whole shot as one clip.
export function clipArgs(
  frame: Pick<EditList, "width" | "height" | "fps">,
  shot: Shot,
  output: string,
  intermediate = false,
): string[] {
  return segmentArgs(
    { ...frame, shots: [shot] },
    { kind: "shot", shot: 0, from: 0, count: shot.frames, start: 0 },
    output,
    intermediate,
  );
}

// One clip of the slideshow: part of a shot, or a transition between two, with the Look.
export function segmentArgs(
  edit: Pick<EditList, "width" | "height" | "fps" | "shots"> &
    Partial<Pick<EditList, "look" | "cards">>,
  segment: Segment,
  output: string,
  intermediate = false,
  // The clip's own chapter-card script, beside it in the working folder (`cards.ts`).
  cardsFile = "cards.ass",
): string[] {
  const inputs: string[] = [];
  const chains: string[] = [];
  const picture = (shot: Shot | undefined, from: number, label: string): void => {
    if (shot === undefined)
      throw new Error(
        "Slopify hit an internal error (the video's edit list lost a shot). Use More → Render the video again in the Video section; if it happens again, use Download diagnostics in Settings and report it.",
      );
    const at = inputs.filter((one) => one === "-i").length;
    const built = pictureChain(edit, shot, from, segment.count, at, label, gradeFilter(edit.look));
    inputs.push(...built.inputs);
    chains.push(built.chain);
  };
  const look = lookChain(edit, segment.start, segment.count, "[p]", "[v]", cardsFile);
  const picked = look === undefined ? "[v]" : "[p]";
  if (segment.kind === "shot") picture(edit.shots[segment.shot], segment.from, picked);
  else {
    const before = edit.shots[segment.from];
    const after = edit.shots[segment.to];
    const halves = transitionHalves(segment.count);
    picture(before, (before?.frames ?? 0) - halves.tail, "[ta]");
    picture(after, -halves.tail, "[tb]");
    const style = after?.transition?.kind ?? "crossfade";
    chains.push(
      `[ta][tb]xfade=transition=${xfadeNames[style]}:duration=${seconds6(segment.count / edit.fps)}:offset=0${picked}`,
    );
  }
  if (look !== undefined) chains.push(look);
  return [
    ...progressArgs,
    ...inputs,
    "-filter_complex",
    chains.join(";"),
    "-map",
    "[v]",
    // The clip is exactly its frames, whatever a filter's rounding of seconds would give.
    ...(segment.kind === "shot" && segment.from === 0 && look === undefined
      ? []
      : ["-frames:v", String(segment.count)]),
    ...videoCodec,
    ...lookEncoding(edit.look),
    ...(intermediate ? ["-crf", intermediateCrf] : []),
    "-an",
    output,
  ];
}

const xfadeNames: Readonly<Record<TransitionStyle, string>> = {
  crossfade: "fade",
  fadeblack: "fadeblack",
  slide: "slideleft",
  wipe: "wipeleft",
};

// The picture of `count` frames of `shot` from its own frame `from`, into `label`. A frame
// before the shot's first shows its first, and one past its last shows its last (a still's
// motion holds) or plays on (a clip keeps running), which is what a transition overlapping
// the cut shows.
function pictureChain(
  frame: Pick<EditList, "width" | "height" | "fps">,
  shot: Shot,
  from: number,
  count: number,
  input: number,
  label: string,
  grade: string | undefined,
): { readonly inputs: readonly string[]; readonly chain: string } {
  const source = shot.source;
  if (source.kind === "video") {
    const { width, height, fps } = frame;
    const pad = Math.max(0, -from);
    const first = from + pad;
    return {
      // Looped for as long as the shot needs; trim ends the stream.
      inputs: ["-stream_loop", "-1", "-i", source.path],
      chain:
        `[${String(input)}:v]setpts=(PTS-STARTPTS)*${slowdown(source.seconds, shot.frames / fps)},` +
        `fps=${String(fps)},` +
        `scale=${String(width)}:${String(height)}:force_original_aspect_ratio=increase,` +
        `crop=${String(width)}:${String(height)},setsar=1,` +
        (grade === undefined ? "" : `${grade},`) +
        (pad > 0 ? `tpad=start=${String(pad)}:start_mode=clone,` : "") +
        `trim=start_frame=${String(first)}:end_frame=${String(first + count)},` +
        // Padding and trimming drop the declared rate, which a transition needs to match.
        `setpts=PTS-STARTPTS,fps=${String(fps)},format=yuv420p${label}`,
    };
  }
  const move = zoompan(shot.motion, shot.frames, frameExpression(from, count, shot.frames));
  // A still that does not move has no sub-pixel steps to smooth, so it is not prescaled.
  const factor = move === undefined ? 1 : prescale;
  const wide = frame.width * factor;
  const tall = frame.height * factor;
  // Clips that meet in a transition are brought to one pixel format first, since xfade
  // refuses to blend two that differ; a plain shot is left as it always was.
  const plain = from === 0 && count === shot.frames;
  return {
    inputs: ["-i", source.path],
    chain:
      `[${String(input)}:v]trim=end_frame=1,setpts=PTS-STARTPTS,` +
      // The grade is applied here, to the one still frame, rather than to every frame after.
      (grade === undefined ? "" : `${grade},`) +
      // Cover the frame and centre-crop, never letterbox.
      `scale=${wide}:${tall}:force_original_aspect_ratio=increase,crop=${wide}:${tall},` +
      `zoompan=z='${move?.z ?? "1"}':d=${count}:` +
      `x='${move?.x ?? centredX}':y='${move?.y ?? centredY}':` +
      `s=${frame.width}x${frame.height}:fps=${frame.fps},setsar=1${plain ? "" : ",format=yuv420p"}${label}`,
  };
}

// ceiling: a clip shorter than its shot is slowed to at most half speed, which still reads
// as natural motion; past that it loops.
const slowestSpeed = 2;

// How much a clip of `clip` seconds is stretched to fill a shot of `shot` seconds, as exact
// decimal text: 1 when it is long enough.
export function slowdown(clip: number, shot: number): string {
  if (!(clip > 0) || shot <= clip) return "1";
  return decimal(Math.round(Math.min(slowestSpeed, shot / clip) * 1000));
}

// zoompan's `on` counts the clip's own frames from 0; a clip that starts `from` frames into
// its shot adds that, and one that reaches before or past the shot holds at its ends.
function frameExpression(from: number, count: number, frames: number): string {
  const shifted = from === 0 ? "on" : `(on${from > 0 ? "+" : "-"}${String(Math.abs(from))})`;
  return from < 0 || from + count > frames
    ? `clip(${shifted},0,${String(Math.max(0, frames - 1))})`
    : shifted;
}

function seconds6(value: number): string {
  return value.toFixed(6);
}

// The concat demuxer's own format. Names are resolved beside the list and are this
// module's `cN.mp4`, so nothing in them needs quoting.
export function concatList(order: readonly string[]): string {
  return `ffconcat version 1.0\n${order.map((name) => `file ${name}`).join("\n")}\n`;
}

// A picture laid into the video before the captions are burned in: a podcast speaker's
// portrait, scaled and centre-cropped to fill its square tile of the speaker panel.
export interface PortraitOverlay {
  // Resolved beside the caption file, like it.
  readonly path: string;
  readonly x: number;
  readonly y: number;
  readonly size: number;
}

// The video's sound: the narration's segments and silences joined, with the ambient bed under
// them when there is one, as the inputs from `first` on and the chains ending in `[a]`.
function audioMix(
  edit: Pick<EditList, "audio"> & Partial<Pick<EditList, "bed">>,
  first: number,
): { readonly inputs: string[]; readonly chains: string[] } {
  const inputs: string[] = [];
  const audioAt: number[] = [];
  for (const segment of edit.audio) {
    audioAt.push(first + audioAt.length);
    if (segment.path === null) {
      inputs.push(
        "-f",
        "lavfi",
        "-t",
        seconds(segment.seconds),
        "-i",
        `anullsrc=r=${sampleRate}:cl=${channelLayout}`,
      );
      continue;
    }
    inputs.push("-i", segment.path);
  }
  const chains: string[] = [];
  audioAt.forEach((input, at) => {
    // The segments come from different files and the silence from lavfi, so they are
    // brought to one format before concat, which refuses to join mismatched streams.
    chains.push(
      `[${input}:a]aformat=sample_fmts=fltp:sample_rates=${sampleRate}:channel_layouts=${channelLayout}[a${at}]`,
    );
  });
  // The ambient bed lies under the joined narration, ducked by it (`ambient-mix.ts`); without
  // one the arguments are the ones every video was joined with.
  const bed = audioAt.length > 0 ? edit.bed : undefined;
  if (audioAt.length > 0) {
    chains.push(
      `${audioAt.map((_input, at) => `[a${at}]`).join("")}concat=n=${audioAt.length}:v=0:a=1${bed === undefined ? "[a]" : "[narration]"}`,
    );
  }
  if (bed !== undefined) {
    const total = edit.audio.reduce((sum, segment) => sum + segment.seconds, 0);
    inputs.push(...bedInputs(bed, total, sampleRate));
    chains.push(
      ...bedChains(
        bed,
        first + audioAt.length,
        total,
        `aformat=sample_fmts=fltp:sample_rates=${sampleRate}:channel_layouts=${channelLayout}`,
        "[narration]",
        "[a]",
      ),
    );
  }
  return { inputs, chains };
}

// The video's sound alone, as a WAV: what Level the volume masters before the join plays it
// (`slideshow.ts`).
export function audioMixArgs(
  edit: Pick<EditList, "audio"> & Partial<Pick<EditList, "bed">>,
  output: string,
): string[] {
  const mix = audioMix(edit, 0);
  return [
    ...progressArgs,
    ...mix.inputs,
    "-filter_complex",
    mix.chains.join(";"),
    "-map",
    "[a]",
    "-c:a",
    "pcm_s16le",
    "-f",
    "wav",
    output,
  ];
}

export function joinArgs(
  edit: Pick<EditList, "audio"> & Partial<Pick<EditList, "look" | "bed">>,
  output: string,
  list: string,
  burnSubtitles = false,
  portraits: readonly PortraitOverlay[] = [],
): string[] {
  const mix = audioMix(edit, 1);
  const inputs: string[] = ["-f", "concat", "-i", list, ...mix.inputs];
  const chains: string[] = [];
  const overlaid = burnSubtitles && portraits.length > 0;
  if (burnSubtitles && !overlaid) chains.push("[0:v]ass=filename=subtitles.ass:fontsdir=fonts[v]");
  chains.push(...mix.chains);
  // The portraits go in after every other input and under the captions, so the panel's lit
  // outline is drawn over them; a video without any is joined exactly as before. A still
  // image is one frame, which overlay holds to the end (`eof_action=repeat`).
  if (overlaid) {
    let first = inputs.filter((value) => value === "-i").length;
    let source = "[0:v]";
    const video: string[] = [];
    portraits.forEach((portrait, at) => {
      inputs.push("-i", portrait.path);
      const size = String(portrait.size);
      video.push(
        `[${String(first)}:v]scale=${size}:${size}:force_original_aspect_ratio=increase,crop=${size}:${size},setsar=1[pic${String(at)}]`,
        `${source}[pic${String(at)}]overlay=x=${String(portrait.x)}:y=${String(portrait.y)}:eof_action=repeat[panel${String(at)}]`,
      );
      source = `[panel${String(at)}]`;
      first += 1;
    });
    chains.unshift(...video, `${source}ass=filename=subtitles.ass:fontsdir=fonts[v]`);
  }

  return [
    ...progressArgs,
    ...inputs,
    ...(chains.length > 0 ? ["-filter_complex", chains.join(";")] : []),
    "-map",
    burnSubtitles ? "[v]" : "0:v",
    ...(edit.audio.length > 0 ? ["-map", "[a]"] : []),
    ...(burnSubtitles ? [...videoCodec, ...lookEncoding(edit.look)] : ["-c:v", "copy"]),
    ...(edit.audio.length > 0 ? ["-c:a", "aac"] : ["-an"]),
    "-movflags",
    "+faststart",
    output,
  ];
}

const progressArgs = [
  "-hide_banner",
  "-nostdin",
  "-loglevel",
  "error",
  // Progress on stdout keeps stderr free to carry only what went wrong.
  "-progress",
  "pipe:1",
  "-nostats",
  "-y",
] as const;
const videoCodec = ["-c:v", "libx264", "-pix_fmt", "yuv420p"] as const;

const centredX = "iw/2-(iw/zoom/2)";
const centredY = "ih/2-(ih/zoom/2)";

interface Zoompan {
  readonly z: string;
  readonly x: string;
  readonly y: string;
}

// zoompan's expressions for a motion, or undefined for one that does not move. `on` is
// zoompan's output frame counter, 0 to d-1 (`at` shifts it for part of a shot), and a
// one-frame shot has no span to divide by, so it holds where it starts. `zoom` in x and y is
// the current zoom, so iw-iw/zoom is the room the crop window has to travel in.
function zoompan(motion: Motion, frames: number, at = "on"): Zoompan | undefined {
  if (motion.kind === "still") return undefined;
  const range = zoomRange(motion.percent);
  if (range === undefined) return undefined;
  const span = frames - 1;
  if (motion.kind === "zoom") {
    // Zoom in rises from 100%, zoom out falls back to it, linear over the shot.
    const z =
      motion.direction === "in"
        ? span < 1
          ? range.from
          : `${range.from}+${range.by}*${at}/${span}`
        : span < 1
          ? range.to
          : `${range.to}-${range.by}*${at}/${span}`;
    return { z, x: centredX, y: centredY };
  }
  return {
    z: range.to,
    x: `(iw-iw/zoom)*(${travel(motion.from.x, motion.to.x, span, at)})`,
    y: `(ih-ih/zoom)*(${travel(motion.from.y, motion.to.y, span, at)})`,
  };
}

// A share of the room from `from` to `to`, linear over the shot. Built in whole
// thousandths as decimal text, like the zoom, so 1 - 0.5 reads 0.5 and never
// 0.49999999999999994.
function travel(from: number, to: number, span: number, at: string): string {
  const start = Math.round(from * 1000);
  const by = Math.round(to * 1000) - start;
  if (span < 1 || by === 0) return decimal(start);
  return `${decimal(start)}${by > 0 ? "+" : "-"}${decimal(Math.abs(by))}*${at}/${span}`;
}

function seconds(value: number): string {
  return value.toFixed(3);
}

// ffmpeg's `-progress` writes `out_time_ms` in microseconds, and has since long before
// it added the correctly named `out_time_us`; both keys carry the same number. Either
// reads `N/A` until the first frame is muxed.
const progressKey = /^out_time_(?:us|ms)=(\d+)$/;

export function progressMsOf(line: string): number | undefined {
  const matched = progressKey.exec(line.trim());
  const microseconds = matched?.[1];
  return microseconds === undefined ? undefined : Math.floor(Number(microseconds) / 1000);
}

export interface RenderRun {
  readonly bin: string;
  readonly cwd?: string | undefined;
  readonly args: readonly string[];
  readonly signal: AbortSignal;
  readonly onProgress: (elapsedMs: number) => void;
  readonly log: Log;
  // Everything written to stderr, as it arrives, for a caller that reads what a filter printed
  // there (the loudness measurement's JSON, `loudness/loudnorm.ts`).
  readonly onStderr?: ((text: string) => void) | undefined;
}

// ceiling: the last 20 lines of stderr are kept. The renderer's error is shown verbatim,
// and ffmpeg's useful complaint is always at the end of what it wrote.
const stderrLines = 20;

export function runFfmpeg(run: RenderRun): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (run.signal.aborted) {
      reject(new Error("the render was canceled before it started"));
      return;
    }
    // Subtitle filters use their own working directory. An explicit relative binary
    // still resolves from the app launch directory, where boot verified it.
    const executable =
      !isAbsolute(run.bin) && /[\\/]/.test(run.bin) ? resolvePath(run.bin) : run.bin;
    const child = spawn(executable, [...run.args], {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      ...(run.cwd === undefined ? {} : { cwd: run.cwd }),
    });
    const errors: string[] = [];
    let pending = "";

    // A throw out of a stream listener is an uncaughtException, not a rejection: it would
    // leave this promise unsettled forever while the child kept writing the output file.
    // Reporting progress is advisory, so a caller that throws is logged and ignored.
    const guarded = (what: string, work: () => void): void => {
      try {
        work();
      } catch (error) {
        run.log.write("warn", what, { detail: messageOf(error) });
      }
    };

    const report = (line: string): void => {
      const elapsed = progressMsOf(line);
      if (elapsed !== undefined) {
        guarded("video.progress", () => {
          run.onProgress(elapsed);
        });
      }
    };

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      guarded("video.progress.read", () => {
        pending += chunk;
        const lines = pending.split("\n");
        pending = lines.pop() ?? "";
        for (const line of lines) {
          report(line);
        }
      });
    });

    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      guarded("video.stderr.read", () => {
        run.onStderr?.(chunk);
        for (const line of chunk.split("\n")) {
          if (line.trim() !== "") {
            errors.push(line.trim());
          }
        }
        errors.splice(0, Math.max(0, errors.length - stderrLines));
      });
    });

    const stop = (): void => {
      child.kill("SIGKILL");
    };
    run.signal.addEventListener("abort", stop, { once: true });

    child.on("error", (error: Error) => {
      run.signal.removeEventListener("abort", stop);
      reject(
        new Error(
          `Slopify could not start ffmpeg, the tool it uses to make audio and video (${error.message}). Reinstall Slopify, or if you set SLOPIFY_FFMPEG, check that it points to a working ffmpeg program.`,
        ),
      );
    });
    child.on("close", (code: number | null, signal: NodeJS.Signals | null) => {
      run.signal.removeEventListener("abort", stop);
      // ffmpeg's last progress block need not end in a newline, and probeDurationMs
      // derives its whole answer from these lines, so the remainder is read before the
      // promise settles.
      report(pending);
      if (run.signal.aborted) {
        reject(new Error("the render was canceled"));
        return;
      }
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(failure(code, signal, errors)));
    });
  });
}

// The duration the plan is built from, and the one a test reads back off the finished
// mp4. Taken from a full decode rather than the container header, because a provided
// variable-bitrate mp3 can carry a header duration that is only an estimate.
export async function probeDurationMs(
  bin: string,
  file: string,
  signal: AbortSignal,
  log: Log,
): Promise<number> {
  let last = 0;
  await runFfmpeg({
    bin,
    args: [
      "-hide_banner",
      "-nostdin",
      "-loglevel",
      "error",
      "-progress",
      "pipe:1",
      "-nostats",
      "-i",
      file,
      // Older null muxers report the last packet's start, giving short clips zero
      // duration. One discarded padding sample places that packet at the real end;
      // current muxers include it, adding less than 1ms at supported audio rates.
      // Retire when all supported FFmpeg builds report packet ends.
      "-af",
      "apad=pad_len=1",
      "-f",
      "null",
      "-",
    ],
    signal,
    log,
    onProgress: (elapsedMs: number): void => {
      last = Math.max(last, elapsedMs);
    },
  });
  return last;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function failure(
  code: number | null,
  signal: NodeJS.Signals | null,
  errors: readonly string[],
): string {
  const ended = code === null ? `killed by ${signal ?? "a signal"}` : `exited with code ${code}`;
  const said =
    errors.length === 0
      ? `ffmpeg ${ended} and wrote nothing to its error stream`
      : `ffmpeg ${ended}: ${errors.join(" / ")}`;
  return `The audio/video export failed (${said}). Try again; if it fails again, make sure your disk has free space (see Settings → Backup & storage), then use Download diagnostics in Settings and report it.`;
}
