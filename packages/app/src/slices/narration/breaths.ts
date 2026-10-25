import { mkdirSync, rmSync } from "node:fs";
import { type FileHandle, open, stat } from "node:fs/promises";
import { join } from "node:path";
import { errorText } from "../../kernel/errors.js";
import { editSettings } from "../../kernel/ports/settings-places.js";
import type { FfmpegRun } from "../loudness/loudnorm.js";
import { runFfmpeg } from "../video/ffmpeg.js";
import { breathRate, type Stretch, scanBreaths, softenChunk } from "./breaths-detect.js";

// Soften breaths, made in the join (`breaths-model.ts` says why there). Each narration piece is
// decoded by ffmpeg to 16-bit mono PCM at 48 kHz in a file beside it, read once to find its
// breaths (`breaths-detect.ts`) and once more to write it again as a WAV with them turned down. Both
// reads go in chunks, so a long piece never sits in memory whole, and the detector yields to
// the event loop as it goes, so the server stays responsive while it works. A piece without a
// breath is written again all the same: the join takes every piece in the one format.

// ceiling: one second of audio per read.
const chunkSamples = breathRate;

export async function softenBreaths(
  run: FfmpegRun,
  files: readonly string[],
  directory: string,
): Promise<{
  readonly files: readonly string[];
  readonly softened: number;
  readonly skipped: number;
}> {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const written: string[] = [];
  let softened = 0;
  let skipped = 0;
  for (const [index, file] of files.entries()) {
    run.signal.throwIfAborted();
    const name = `breaths-${String(index + 1).padStart(4, "0")}`;
    const raw = join(directory, `${name}.pcm`);
    const output = join(directory, `${name}.wav`);
    try {
      await runFfmpeg({
        bin: run.bin,
        args: decodeArgs(file, raw),
        signal: run.signal,
        log: run.log,
        onProgress: (): void => {},
      });
      const scan = await scanBreaths(pcmChunks(raw));
      run.signal.throwIfAborted();
      await writeSoftened(raw, output, scan.stretches);
      softened += scan.stretches.length;
      skipped += scan.skipped.length;
    } catch (error) {
      if (run.signal.aborted) throw error;
      throw new Error(
        `Soften breaths could not process narration piece ${String(index + 1)} (${errorText(error)}), so the narration can't be joined together. Use Try again; if it fails again, turn off Soften breaths in ${editSettings.sound} and use Save changes, then use Download diagnostics in Settings and report it.`,
        { cause: error },
      );
    } finally {
      rmSync(raw, { force: true });
    }
    written.push(output);
  }
  return { files: written, softened, skipped };
}

export function decodeArgs(input: string, output: string): string[] {
  return [
    "-hide_banner",
    "-nostdin",
    "-loglevel",
    "error",
    "-nostats",
    "-y",
    "-i",
    input,
    "-map",
    "0:a:0",
    "-ac",
    "1",
    "-ar",
    String(breathRate),
    "-c:a",
    "pcm_s16le",
    "-f",
    "s16le",
    output,
  ];
}

async function* pcmChunks(path: string): AsyncGenerator<Int16Array> {
  const handle = await open(path, "r");
  try {
    for (;;) {
      const chunk = await readChunk(handle);
      if (chunk === undefined) return;
      yield chunk;
    }
  } finally {
    await handle.close();
  }
}

async function readChunk(handle: FileHandle): Promise<Int16Array | undefined> {
  const buffer = Buffer.alloc(chunkSamples * 2);
  const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
  const samples = Math.floor(bytesRead / 2);
  if (samples === 0) return undefined;
  // A copy into its own buffer: Int16Array needs an aligned, even-length view.
  const out = new Int16Array(samples);
  for (let at = 0; at < samples; at += 1) out[at] = buffer.readInt16LE(at * 2);
  return out;
}

async function writeSoftened(
  raw: string,
  output: string,
  stretches: readonly Stretch[],
): Promise<void> {
  const size = (await stat(raw)).size;
  const bytes = size - (size % 2);
  const target = await open(output, "w", 0o600);
  try {
    await target.write(wavHeader(bytes));
    let offset = 0;
    for await (const chunk of pcmChunks(raw)) {
      const soft = softenChunk(chunk, offset, stretches);
      // Typed arrays are little-endian on every platform Slopify ships for, as WAV is.
      await target.write(Buffer.from(soft.buffer, soft.byteOffset, soft.byteLength));
      offset += chunk.length;
    }
  } finally {
    await target.close();
  }
}

// A canonical 44-byte header: PCM, mono, 16-bit, 48 kHz.
export function wavHeader(dataBytes: number): Buffer {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + dataBytes, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(breathRate, 24);
  header.writeUInt32LE(breathRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(dataBytes, 40);
  return header;
}
