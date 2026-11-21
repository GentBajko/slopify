import { existsSync } from "node:fs";
import { type FileHandle, open, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parentPort, Worker, workerData } from "node:worker_threads";
import type * as Detect from "./breaths-detect.js";

// Soften breaths' sample work, in a worker thread of its own for each piece (`breaths.ts`).
// Finding a 5-minute piece's breaths is about 2.4 s of JavaScript; on the server's thread, a
// 2.5-hour narration held it for over a minute in 15 ms turns, and pieces worked on at once
// (`piece-jobs.ts`) could only take turns. In a worker they run side by side and the server's
// thread only waits.
// The worker loads this file as it is (Node strips the types of a source file), so it imports
// nothing of Slopify's but by the URL `sibling` finds: the compiled file, else the source.

export interface BreathJob {
  readonly raw: string;
  readonly output: string;
}

export interface BreathCounts {
  readonly softened: number;
  readonly skipped: number;
}

const marker = "slopify-soften-breaths";

function sibling(name: string): URL {
  const compiled = new URL(`./${name}.js`, import.meta.url);
  return existsSync(fileURLToPath(compiled)) ? compiled : new URL(`./${name}.ts`, import.meta.url);
}

// The breaths in `raw` (16-bit mono PCM at 48 kHz) found and turned down, written to `output`
// as a WAV.
export async function softenPcm(job: BreathJob): Promise<BreathCounts> {
  const detect = (await import(sibling("breaths-detect").href)) as typeof Detect;
  const chunkSamples = detect.breathRate;
  const scan = await detect.scanBreaths(pcmChunks(job.raw, chunkSamples));
  const size = (await stat(job.raw)).size;
  const bytes = size - (size % 2);
  const target = await open(job.output, "w", 0o600);
  try {
    await target.write(pcmWavHeader(bytes, detect.breathRate));
    let offset = 0;
    for await (const chunk of pcmChunks(job.raw, chunkSamples)) {
      const soft = detect.softenChunk(chunk, offset, scan.stretches);
      // Typed arrays are little-endian on every platform Slopify ships for, as WAV is.
      await target.write(Buffer.from(soft.buffer, soft.byteOffset, soft.byteLength));
      offset += chunk.length;
    }
  } finally {
    await target.close();
  }
  return { softened: scan.stretches.length, skipped: scan.skipped.length };
}

// `softenPcm` in a worker; cancelling stops the worker.
export function softenPcmInWorker(job: BreathJob, signal: AbortSignal): Promise<BreathCounts> {
  signal.throwIfAborted();
  return new Promise<BreathCounts>((resolve, reject) => {
    const worker = new Worker(sibling("breaths-worker"), {
      workerData: { [marker]: true, ...job },
    });
    let settled = false;
    const settle = (error: Error | undefined, counts?: BreathCounts): void => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", stop);
      if (error === undefined && counts !== undefined) resolve(counts);
      else reject(error ?? new Error("the breath worker gave no answer"));
    };
    const stop = (): void => {
      settle(new Error("Soften breaths was canceled"));
      void worker.terminate();
    };
    signal.addEventListener("abort", stop, { once: true });
    worker.on("message", (message: { readonly counts?: BreathCounts; readonly error?: string }) => {
      if (message.counts !== undefined) settle(undefined, message.counts);
      else settle(new Error(message.error ?? "the breath worker failed"));
    });
    worker.on("error", (error: unknown) => {
      settle(error instanceof Error ? error : new Error(String(error)));
    });
    worker.on("exit", (code) => {
      settle(new Error(`the breath worker stopped (exit code ${String(code)})`));
    });
  });
}

async function* pcmChunks(path: string, chunkSamples: number): AsyncGenerator<Int16Array> {
  const handle = await open(path, "r");
  try {
    for (;;) {
      const chunk = await readChunk(handle, chunkSamples);
      if (chunk === undefined) return;
      yield chunk;
    }
  } finally {
    await handle.close();
  }
}

async function readChunk(
  handle: FileHandle,
  chunkSamples: number,
): Promise<Int16Array | undefined> {
  const buffer = Buffer.alloc(chunkSamples * 2);
  const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
  const samples = Math.floor(bytesRead / 2);
  if (samples === 0) return undefined;
  // A copy into its own buffer: Int16Array needs an aligned, even-length view. PCM is
  // little-endian, as typed arrays are on every platform Slopify ships for.
  const out = new Int16Array(samples);
  new Uint8Array(out.buffer).set(buffer.subarray(0, samples * 2));
  return out;
}

// A canonical 44-byte header: PCM, mono, 16-bit, at `rate`.
export function pcmWavHeader(dataBytes: number, rate: number): Buffer {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + dataBytes, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(dataBytes, 40);
  return header;
}

const port = parentPort;
if (
  port !== null &&
  typeof workerData === "object" &&
  workerData !== null &&
  (workerData as Record<string, unknown>)[marker] === true
) {
  const job = workerData as BreathJob;
  softenPcm({ raw: job.raw, output: job.output }).then(
    (counts) => {
      port.postMessage({ counts });
    },
    (error: unknown) => {
      port.postMessage({ error: error instanceof Error ? error.message : String(error) });
    },
  );
}
