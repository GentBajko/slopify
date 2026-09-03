import { copyFileSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Log } from "../../kernel/log.js";
import { probeDurationMs, runFfmpeg } from "../video/ffmpeg.js";

// Concatenate the chunk audio in chunk order with no added silence; provider default sample
// rate; one output file. The concat demuxer is what joins them and `probeDurationMs` is what
// measures the result - both already live in `slices/video/ffmpeg.ts`, because there is one
// ffmpeg in this app and one place that spawns it. Only the argument list is new, and it is
// hand-rolled per the standards.

export interface JoinDeps {
  readonly bin: string;
  readonly log: Log;
}

export interface JoinInput {
  // Absolute paths, in chunk order. The order is the invariant: "Chunk order is preserved
  // in the output file".
  readonly files: readonly string[];
  // Where the demuxer's script is written. It is removed again whether or not the join
  // succeeded; a leftover is collected by the boot reconcile.
  readonly listPath: string;
  readonly output: string;
  readonly signal: AbortSignal;
}

// The concat demuxer's script format. A path is single-quoted, and the one character that
// can end the quoting is spelled out, so a folder with an apostrophe in it cannot become
// two arguments. A quoted line can also never be read as the `#` comment the format has.
export function concatListText(files: readonly string[]): string {
  return `${files.map((file) => `file '${file.replaceAll("'", "'\\''")}'`).join("\n")}\n`;
}

export function concatArgs(listPath: string, output: string): string[] {
  return [
    "-hide_banner",
    "-nostdin",
    "-loglevel",
    "error",
    "-nostats",
    "-y",
    "-f",
    "concat",
    // The script names absolute paths this app built, never anything a user typed.
    "-safe",
    "0",
    "-i",
    listPath,
    // Only the audio: a provider that ships cover art in its mp3 would otherwise put a
    // video stream in the narration.
    "-map",
    "0:a:0",
    // Re-encoded rather than stream-copied. A copy joins frame runs that each carry their own
    // encoder delay and padding, which is the click and the drift at every join: three chunks
    // of 1200, 700 and 450 ms copy to 2409 ms and decode to 2350 ms through here, exactly the
    // sum. That number goes to the video timeline, so it has to be the real one. No `-ar`: the
    // provider's own sample rate is kept. ceiling: one re-encode at the bitrate the adapters
    // ask the providers for. Storing the chunks as wav and encoding once at the end would avoid
    // even that generation, and costs about ten times the disk while a stage is running.
    "-c:a",
    "libmp3lame",
    "-b:a",
    "128k",
    output,
  ];
}

// The body audio and its measured duration - measured, never estimated, because the video
// timeline is built out of it.
export async function joinNarration(deps: JoinDeps, input: JoinInput): Promise<number> {
  const first = input.files[0];
  if (first === undefined) {
    // The stage refuses an empty narration before it gets here, so this is a bug.
    throw new Error("there are no audio chunks to join");
  }
  mkdirSync(dirname(input.output), { recursive: true, mode: 0o700 });

  if (input.files.length === 1) {
    // Whole-text mode, and any run whose article is one paragraph: there is nothing to
    // join, and re-encoding the only chunk would lose quality for no reason.
    input.signal.throwIfAborted();
    copyFileSync(first, input.output);
  } else {
    mkdirSync(dirname(input.listPath), { recursive: true, mode: 0o700 });
    writeFileSync(input.listPath, concatListText(input.files), { mode: 0o600 });
    try {
      await runFfmpeg({
        bin: deps.bin,
        args: concatArgs(input.listPath, input.output),
        signal: input.signal,
        log: deps.log,
        onProgress: (): void => {},
      });
    } finally {
      rmSync(input.listPath, { force: true });
    }
  }

  // Measured off a full decode of the file that was written, not off the parts: a
  // container header can carry an estimate, and the render adds this number to the gaps to
  // get the length of the video.
  return probeDurationMs(deps.bin, input.output, input.signal, deps.log);
}
