import { spawn } from "node:child_process";
import { isAbsolute, resolve as resolvePath } from "node:path";
import type { Log } from "../../kernel/log.js";
import type { ImageSlot, RenderPlan } from "./plan.js";
import { zoomBy, zoomFrom, zoomTo } from "./plan.js";

// Hand-rolled per the standards: the filtergraph is the load-bearing part of this slice
// and a wrapper would hide it. Every value goes into an argument array, never a shell
// string, so a title or a filename cannot become a command.

// zoompan works on a still that has been pre-scaled, because it steps the zoom in
// sub-pixel increments and a source at output resolution visibly jitters where the zoom is
// meant to be smooth and linear. Four times the frame is enough at 122.5%.
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
// scale-and-zoompan chain per slot keeps each chain's frame buffers until the graph closes,
// so its memory grows with the slot count: measured with ffmpeg 7, 200 slots peaked at
// 16 GB and ran 6,000 threads, and a 3-hour video at 15 s per image has 720 slots. So each
// distinct clip (one still, one zoom direction, one length) is encoded once, in its own
// short ffmpeg run with a single input, and the concat demuxer then joins the clips in slot
// order from a list file. Memory is one clip's worth whatever the length; the command
// lines stay a few hundred characters (Windows allows 32,767) because the timeline lives
// in the list, not the arguments; and a still that comes round again costs no second
// zoompan. The clips are identical encodes, so without burned-in captions the join copies
// them rather than encoding again.
export interface SlideshowClips {
  // One per distinct clip, named by its place in this list: `c1.mp4`, `c2.mp4`, ...
  readonly clips: readonly { readonly name: string; readonly slot: ImageSlot }[];
  // The clip each slot plays, in timeline order.
  readonly order: readonly string[];
}

export function slideshowClips(plan: RenderPlan): SlideshowClips {
  const clips: { name: string; slot: ImageSlot }[] = [];
  const named = new Map<string, string>();
  const order = plan.images.map((slot) => {
    const key = JSON.stringify([slot.path, slot.zoom, slot.frames]);
    let name = named.get(key);
    if (name === undefined) {
      name = `c${clips.length + 1}.mp4`;
      named.set(key, name);
      clips.push({ name, slot });
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
  plan: Pick<RenderPlan, "width" | "height" | "fps">,
  slot: ImageSlot,
  output: string,
  intermediate = false,
): string[] {
  const wide = plan.width * prescale;
  const tall = plan.height * prescale;
  return [
    ...progressArgs,
    "-i",
    slot.path,
    "-filter_complex",
    `[0:v]trim=end_frame=1,setpts=PTS-STARTPTS,` +
      // Cover the frame and centre-crop, never letterbox.
      `scale=${wide}:${tall}:force_original_aspect_ratio=increase,crop=${wide}:${tall},` +
      `zoompan=z='${zoomExpression(slot)}':d=${slot.frames}:` +
      `x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':` +
      `s=${plan.width}x${plan.height}:fps=${plan.fps},setsar=1[v]`,
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

export function joinArgs(plan: RenderPlan, list: string, burnSubtitles = false): string[] {
  const inputs: string[] = ["-f", "concat", "-i", list];
  const audioAt: number[] = [];
  for (const segment of plan.audio) {
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
    ...(plan.audio.length > 0 ? ["-map", "[a]"] : []),
    ...(burnSubtitles ? videoCodec : ["-c:v", "copy"]),
    ...(plan.audio.length > 0 ? ["-c:a", "aac"] : ["-an"]),
    "-movflags",
    "+faststart",
    plan.output,
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

// Odd slots 100% → 122.5%, even slots 122.5% → 100%, linear over the slot. `on` is
// zoompan's output frame counter, 0 to d-1, and a one-frame slot has no span to divide
// by, so it holds the zoom it starts at.
function zoomExpression(slot: ImageSlot): string {
  const span = slot.frames - 1;
  if (slot.zoom === "in") {
    return span < 1 ? String(zoomFrom) : `${zoomFrom}+${zoomBy}*on/${span}`;
  }
  return span < 1 ? String(zoomTo) : `${zoomTo}-${zoomBy}*on/${span}`;
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
