import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import ffmpegStatic from "ffmpeg-static";
import { resolveFfmpeg } from "./ffmpeg.js";

export const binary = resolveFfmpeg(process.env, ffmpegStatic);

export function inspectMedia(path: string): string {
  try {
    execFileSync(binary, ["-hide_banner", "-i", path], { stdio: ["ignore", "pipe", "pipe"] });
  } catch (error) {
    return String((error as { stderr?: Buffer }).stderr ?? "");
  }
  throw new Error("ffmpeg inspection unexpectedly exited successfully");
}

export function wavParts(path: string) {
  const bytes = readFileSync(path);
  let format: Buffer | undefined;
  let pcm: Buffer | undefined;
  for (let offset = 12; offset + 8 <= bytes.length; ) {
    const size = bytes.readUInt32LE(offset + 4);
    const name = bytes.toString("ascii", offset, offset + 4);
    if (name === "fmt ") format = bytes.subarray(offset + 8, offset + 8 + size);
    if (name === "data") pcm = bytes.subarray(offset + 8, offset + 8 + size);
    offset += 8 + size + (size % 2);
  }
  if (!format || !pcm) throw new Error("WAV lacks format or PCM data");
  const samples = pcm;
  return {
    signature: bytes.toString("ascii", 0, 4),
    container: bytes.toString("ascii", 8, 12),
    codec: format.readUInt16LE(0),
    channels: format.readUInt16LE(2),
    rate: format.readUInt32LE(4),
    bits: format.readUInt16LE(14),
    duration: pcm.length / (48000 * 2 * 2),
    peakAt: (seconds: number) => {
      const offset = Math.round(seconds * 48000) * 4;
      let peak = 0;
      for (let at = offset; at < Math.min(offset + 480 * 4, samples.length); at += 2)
        peak = Math.max(peak, Math.abs(samples.readInt16LE(at)));
      return peak;
    },
  };
}
