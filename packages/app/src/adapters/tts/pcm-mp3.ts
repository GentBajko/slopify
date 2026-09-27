import { spawn } from "node:child_process";
import { providerError } from "../../kernel/ports/model.js";
import type { PcmToMp3 } from "./gemini.js";

// Raw 16-bit mono PCM in on stdin, MP3 out on stdout, through the app's own ffmpeg. The bitrate
// is the one the narration join re-encodes at (`slices/narration/concat.ts`).
export function pcmToMp3Args(sampleRate: number): string[] {
  return [
    "-hide_banner",
    "-nostdin",
    "-loglevel",
    "error",
    "-f",
    "s16le",
    "-ar",
    String(sampleRate),
    "-ac",
    "1",
    "-i",
    "pipe:0",
    "-c:a",
    "libmp3lame",
    "-b:a",
    "128k",
    "-f",
    "mp3",
    "pipe:1",
  ];
}

export function ffmpegPcmToMp3(bin: string): PcmToMp3 {
  return (pcm, sampleRate, signal) =>
    new Promise<Uint8Array>((resolve, reject) => {
      const child = spawn(bin, pcmToMp3Args(sampleRate), {
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
        signal,
      });
      const out: Buffer[] = [];
      let err = "";
      child.stdout.on("data", (chunk: Buffer) => out.push(chunk));
      child.stderr.on("data", (chunk: Buffer) => {
        err = `${err}${chunk.toString("utf8")}`.slice(-2000);
      });
      child.on("error", (error) => {
        reject(
          signal.aborted
            ? error
            : providerError({
                kind: "other",
                message: `Slopify could not turn Google's audio into MP3 because ffmpeg did not start (${error.message}). Restart Slopify; if it keeps happening, use Download diagnostics in Settings and report it.`,
              }),
        );
      });
      child.on("close", (code) => {
        if (code === 0) resolve(new Uint8Array(Buffer.concat(out)));
        else if (!signal.aborted)
          reject(
            providerError({
              kind: "other",
              message: `Slopify could not turn Google's audio into MP3 (ffmpeg: ${err.trim() || `exit ${String(code)}`}). Use Try again; if it keeps happening, use Download diagnostics in Settings and report it.`,
            }),
          );
      });
      // A closed stdin (ffmpeg gave up early) is reported by the close handler.
      child.stdin.on("error", () => {});
      child.stdin.end(Buffer.from(pcm));
    });
}
