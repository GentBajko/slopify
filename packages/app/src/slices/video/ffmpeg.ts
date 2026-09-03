import { spawn } from "node:child_process";
import type { Log } from "../../kernel/log.js";
import type { ImageSlot, RenderPlan } from "./plan.js";
import { zoomBy, zoomFrom, zoomTo } from "./plan.js";

// Hand-rolled per the standards: the filtergraph is the load-bearing part of this slice
// and a wrapper would hide it. Every value goes into an argument array, never a shell
// string, so a title or a filename cannot become a command.

// zoompan works on a still that has been pre-scaled, because it steps the zoom in
// sub-pixel increments and a source at output resolution visibly jitters where the zoom is
// meant to be smooth and linear. Four times the frame is enough at 115%.
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
    "No ffmpeg binary is available. Slopify ships one through ffmpeg-static; if this " +
      "platform has no build, point SLOPIFY_FFMPEG at an ffmpeg executable.",
  );
}

export function renderArgs(plan: RenderPlan): string[] {
  const inputs: string[] = [];
  for (const slot of plan.images) {
    inputs.push("-i", slot.path);
  }
  const audioAt: number[] = [];
  for (const segment of plan.audio) {
    audioAt.push(plan.images.length + audioAt.length);
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

  return [
    "-hide_banner",
    "-nostdin",
    "-loglevel",
    "error",
    // Progress on stdout keeps stderr free to carry only what went wrong.
    "-progress",
    "pipe:1",
    "-nostats",
    "-y",
    ...inputs,
    "-filter_complex",
    filterGraph(plan, audioAt),
    "-map",
    "[v]",
    "-map",
    "[a]",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-movflags",
    "+faststart",
    plan.output,
  ];
}

function filterGraph(plan: RenderPlan, audioAt: readonly number[]): string {
  const chains: string[] = [];
  const wide = plan.width * prescale;
  const tall = plan.height * prescale;

  plan.images.forEach((slot, at) => {
    chains.push(
      `[${at}:v]trim=end_frame=1,setpts=PTS-STARTPTS,` +
        // Cover the frame and centre-crop, never letterbox.
        `scale=${wide}:${tall}:force_original_aspect_ratio=increase,crop=${wide}:${tall},` +
        `zoompan=z='${zoomExpression(slot)}':d=${slot.frames}:` +
        `x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':` +
        `s=${plan.width}x${plan.height}:fps=${plan.fps},setsar=1[v${at}]`,
    );
  });
  chains.push(
    `${plan.images.map((_slot, at) => `[v${at}]`).join("")}concat=n=${plan.images.length}:v=1:a=0[v]`,
  );

  audioAt.forEach((input, at) => {
    // The segments come from different files and the silence from lavfi, so they are
    // brought to one format before concat, which refuses to join mismatched streams.
    chains.push(
      `[${input}:a]aformat=sample_fmts=fltp:sample_rates=${sampleRate}:channel_layouts=${channelLayout}[a${at}]`,
    );
  });
  chains.push(
    `${audioAt.map((_input, at) => `[a${at}]`).join("")}concat=n=${audioAt.length}:v=0:a=1[a]`,
  );

  return chains.join(";");
}

// Odd images 100% → 115%, even images 115% → 100%, linear over the slot. `on` is
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
    const child = spawn(run.bin, [...run.args], { stdio: ["ignore", "pipe", "pipe"] });
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
      reject(new Error(`ffmpeg could not be started: ${error.message}`));
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
  return errors.length === 0
    ? `ffmpeg ${ended} and wrote nothing to its error stream`
    : `ffmpeg ${ended}: ${errors.join(" / ")}`;
}
