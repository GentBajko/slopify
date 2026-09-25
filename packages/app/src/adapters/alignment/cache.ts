import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, mkdtemp, rename, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStreamReadResult } from "node:stream/web";
import { setTimeout as delay } from "node:timers/promises";

interface ModelFile {
  readonly filename: string;
  readonly url: string;
  readonly bytes: number;
  readonly sha256: string;
}
interface ModelInput {
  readonly cacheDir: string;
  readonly signal: AbortSignal;
  readonly onProgress?: ((current: number, total: number) => void) | undefined;
}
interface ModelDeps {
  readonly model: ModelFile;
  readonly fetch: typeof fetch;
  readonly wait?: (milliseconds: number, signal: AbortSignal) => Promise<void>;
}
const revision = "a19f851b3d42865797e410752b4c570c871e4825";
export const alignmentModel: ModelFile = {
  filename: "wav2vec2-base-960h-cd5040c1.onnx",
  url: `https://huggingface.co/Xenova/wav2vec2-base-960h/resolve/${revision}/onnx/model_quantized.onnx`,
  bytes: 95_286_046,
  sha256: "cd5040c147381580ed73258143dd8e0c28e800a09e74ee42ee2b3e8cb4d760a3",
};

export async function prepareModel(
  input: ModelInput,
  deps: ModelDeps = { model: alignmentModel, fetch: globalThis.fetch },
): Promise<string> {
  input.signal.throwIfAborted();
  await mkdir(input.cacheDir, { recursive: true, mode: 0o700 });
  const target = join(input.cacheDir, deps.model.filename);
  if (await verified(target, deps.model, input.signal)) return target;
  let lastFailure: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await downloadModel(input, deps, target);
    } catch (error) {
      input.signal.throwIfAborted();
      if (!(error instanceof Error) || error.name !== "SubtitleModelDownloadInterrupted")
        throw error;
      lastFailure = error;
      if (attempt < 3) {
        if (deps.wait) await deps.wait(attempt * 1000, input.signal);
        else await delay(attempt * 1000, undefined, { signal: input.signal });
      }
    }
  }
  throw new Error(
    "The free subtitle model download was interrupted after 3 attempts. Check your connection and retry.",
    { cause: lastFailure },
  );
}

async function downloadModel(input: ModelInput, deps: ModelDeps, target: string): Promise<string> {
  input.signal.throwIfAborted();
  const staging = await mkdtemp(join(input.cacheDir, ".alignment-download-"));
  const part = join(staging, "model.part");
  try {
    let response: Response;
    try {
      response = await deps.fetch(deps.model.url, {
        signal: AbortSignal.any([input.signal, AbortSignal.timeout(300_000)]),
      });
    } catch (error) {
      throw interrupted(error);
    }
    if (!response.ok || response.body === null) {
      const error = new Error(
        `The free subtitle model could not be downloaded (HTTP ${response.status}). Check your connection and try again.`,
      );
      let failure: Error = error;
      try {
        if (response.body !== null) await response.body.cancel();
      } catch (cleanup) {
        failure = new AggregateError([error, cleanup], error.message, { cause: error });
      }
      if (response.status === 408 || response.status === 429 || response.status >= 500)
        throw interrupted(failure);
      throw failure;
    }
    let current = 0;
    const hash = createHash("sha256");
    const reader = response.body.getReader();
    async function* chunks(): AsyncGenerator<Uint8Array> {
      let readFailed = false;
      try {
        for (;;) {
          input.signal.throwIfAborted();
          let result: ReadableStreamReadResult<Uint8Array>;
          try {
            result = await reader.read();
          } catch (error) {
            readFailed = true;
            throw interrupted(error);
          }
          if (result.done) break;
          current += result.value.length;
          if (current > deps.model.bytes)
            throw new Error("The subtitle model failed download size verification.");
          hash.update(result.value);
          input.onProgress?.(current, deps.model.bytes);
          yield result.value;
        }
      } finally {
        try {
          if (!readFailed) await reader.cancel();
        } finally {
          reader.releaseLock();
        }
      }
    }
    await pipeline(Readable.from(chunks()), createWriteStream(part, { mode: 0o600 }), {
      signal: input.signal,
    });
    input.signal.throwIfAborted();
    if (current !== deps.model.bytes || hash.digest("hex") !== deps.model.sha256)
      throw new Error("The subtitle model failed download verification. Please try again.");
    // Each caller writes in its own directory. On Windows a completed concurrent download
    // may already own the final filename; reuse it only after the same verification.
    try {
      await rename(part, target);
    } catch (error) {
      if (await verified(target, deps.model, input.signal)) return target;
      if (!isCode(error, "EEXIST") && !isCode(error, "EPERM")) throw error;
      await rm(target, { force: true });
      await rename(part, target);
    }
    return target;
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

function interrupted(cause: unknown): Error {
  const error = new Error("The subtitle model download was interrupted.", { cause });
  error.name = "SubtitleModelDownloadInterrupted";
  return error;
}

async function verified(path: string, model: ModelFile, signal: AbortSignal): Promise<boolean> {
  try {
    if ((await stat(path)).size !== model.bytes) return false;
    const hash = createHash("sha256");
    await pipeline(createReadStream(path), hash, { signal });
    return hash.digest("hex") === model.sha256;
  } catch (error) {
    if (isCode(error, "ENOENT")) return false;
    throw error;
  }
}
function isCode(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}
