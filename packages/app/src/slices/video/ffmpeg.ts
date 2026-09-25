import { spawn } from "node:child_process";
import { isAbsolute, resolve as resolvePath } from "node:path";
import type { Log } from "../../kernel/log.js";
import type { EditList, Motion, Shot } from "./edit-list.js";
import { decimal, zoomRange } from "./plan.js";

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
export interface SlideshowClips {
  // One per distinct clip, named by its place in this list: `c1.mp4`, `c2.mp4`, ...
  readonly clips: readonly { readonly name: string; readonly shot: Shot }[];
  // The clip each shot plays, in timeline order.
  readonly order: readonly string[];
}

export function slideshowClips(edit: Pick<EditList, "shots">): SlideshowClips {
  const clips: { name: string; shot: Shot }[] = [];
  const named = new Map<string, string>();
  const order = edit.shots.map((shot) => {
    // The motion is plain data built in a fixed key order, so equal motions stringify
    // alike.
    const key = JSON.stringify([shot.source, shot.motion, shot.frames]);
    let name = named.get(key);
    if (name === undefined) {
      name = `c${clips.length + 1}.mp4`;
      named.set(key, name);
      clips.push({ name, shot });
    }
    return name;
  });
  return { clips, order };
}

// Clips that are joined by copying get the final encode's settings. Clips that will be
// decoded again under burned-in captions are kept closer to the source, so the second
// encode is not a visible second generation.
const intermediateCrf = "16";

export function clipArgs(
  frame: Pick<EditList, "width" | "height" | "fps">,
  shot: Shot,
  output: string,
  intermediate = false,
): string[] {
  const move = zoompan(shot.motion, shot.frames);
  // A still that does not move has no sub-pixel steps to smooth, so it is not prescaled.
  const factor = move === undefined ? 1 : prescale;
  const wide = frame.width * factor;
  const tall = frame.height * factor;
  return [
    ...progressArgs,
    "-i",
    shot.source.path,
    "-filter_complex",
    `[0:v]trim=end_frame=1,setpts=PTS-STARTPTS,` +
      // Cover the frame and centre-crop, never letterbox.
      `scale=${wide}:${tall}:force_original_aspect_ratio=increase,crop=${wide}:${tall},` +
      `zoompan=z='${move?.z ?? "1"}':d=${shot.frames}:` +
      `x='${move?.x ?? centredX}':y='${move?.y ?? centredY}':` +
      `s=${frame.width}x${frame.height}:fps=${frame.fps},setsar=1[v]`,
    "-map",
    "[v]",
    ...videoCodec,
    ...(intermediate ? ["-crf", intermediateCrf] : []),
    "-an",
    output,
  ];
}

// The concat demuxer's own format. Names are resolved beside the list and are this
// module's `cN.mp4`, so nothing in them needs quoting.
export function concatList(order: readonly string[]): string {
  return `ffconcat version 1.0\n${order.map((name) => `file ${name}`).join("\n")}\n`;
}

export function joinArgs(
  edit: Pick<EditList, "audio">,
  output: string,
  list: string,
  burnSubtitles = false,
): string[] {
  const inputs: string[] = ["-f", "concat", "-i", list];
  const audioAt: number[] = [];
  for (const segment of edit.audio) {
    audioAt.push(1 + audioAt.length);
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
  if (burnSubtitles) chains.push("[0:v]ass=filename=subtitles.ass:fontsdir=fonts[v]");
  audioAt.forEach((input, at) => {
    // The segments come from different files and the silence from lavfi, so they are
    // brought to one format before concat, which refuses to join mismatched streams.
    chains.push(
      `[${input}:a]aformat=sample_fmts=fltp:sample_rates=${sampleRate}:channel_layouts=${channelLayout}[a${at}]`,
    );
  });
  if (audioAt.length > 0) {
    chains.push(
      `${audioAt.map((_input, at) => `[a${at}]`).join("")}concat=n=${audioAt.length}:v=0:a=1[a]`,
    );
  }

  return [
    ...progressArgs,
    ...inputs,
    ...(chains.length > 0 ? ["-filter_complex", chains.join(";")] : []),
    "-map",
    burnSubtitles ? "[v]" : "0:v",
    ...(edit.audio.length > 0 ? ["-map", "[a]"] : []),
    ...(burnSubtitles ? videoCodec : ["-c:v", "copy"]),
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
// zoompan's output frame counter, 0 to d-1, and a one-frame shot has no span to divide
// by, so it holds where it starts. `zoom` in x and y is the current zoom, so iw-iw/zoom
// is the room the crop window has to travel in.
function zoompan(motion: Motion, frames: number): Zoompan | undefined {
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
          : `${range.from}+${range.by}*on/${span}`
        : span < 1
          ? range.to
          : `${range.to}-${range.by}*on/${span}`;
    return { z, x: centredX, y: centredY };
  }
  return {
    z: range.to,
    x: `(iw-iw/zoom)*(${travel(motion.from.x, motion.to.x, span)})`,
    y: `(ih-ih/zoom)*(${travel(motion.from.y, motion.to.y, span)})`,
  };
}

// A share of the room from `from` to `to`, linear over the shot. Built in whole
// thousandths as decimal text, like the zoom, so 1 - 0.5 reads 0.5 and never
// 0.49999999999999994.
function travel(from: number, to: number, span: number): string {
  const start = Math.round(from * 1000);
  const by = Math.round(to * 1000) - start;
  if (span < 1 || by === 0) return decimal(start);
  return `${decimal(start)}${by > 0 ? "+" : "-"}${decimal(Math.abs(by))}*on/${span}`;
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
  return `The audio/video export failed (${said}). Retry stage; if it fails again, make sure your disk has free space (see Settings → Backup & storage), then use Download diagnostics in Settings and report it.`;
}
