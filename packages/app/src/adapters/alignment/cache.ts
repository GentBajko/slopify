import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { chmod, copyFile, mkdir, mkdtemp, rename, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStreamReadResult } from "node:stream/web";
import { setTimeout as delay } from "node:timers/promises";
import { hasErrnoCode } from "../../kernel/errors.js";
import {
  defaultEnglishSubtitleModel,
  type EnglishSubtitleModel,
} from "../../kernel/ports/subtitles.js";

export interface ModelFile {
  readonly filename: string;
  readonly url: string;
  readonly bytes: number;
  readonly sha256: string;
  // How long one download attempt may take; absent is five minutes, enough for the 95 MB
  // English int8 model. The larger English and multilingual models get longer.
  readonly timeoutMs?: number | undefined;
}
interface ModelInput {
  readonly cacheDir: string;
  // A verified copy shipped with the install (the Docker image carries one). Used instead of
  // the network when the cache is empty; checked against the same size and hash first.
  readonly seed?: string | undefined;
  readonly signal: AbortSignal;
  readonly onProgress?: ((current: number, total: number) => void) | undefined;
}
export interface ModelDeps {
  readonly model: ModelFile;
  readonly fetch: typeof fetch;
  readonly wait?: (milliseconds: number, signal: AbortSignal) => Promise<void>;
}
// Xenova/wav2vec2-base-960h at one pinned revision, which carries the same model at three
// precisions. Each keeps its own file name so the cache can hold any of them at once; int8
// keeps the name every install used before the choice existed.
const revision = "a19f851b3d42865797e410752b4c570c871e4825";
const repo = `https://huggingface.co/Xenova/wav2vec2-base-960h/resolve/${revision}/onnx`;
export const englishModels: Readonly<Record<EnglishSubtitleModel, ModelFile>> = {
  fp32: {
    filename: "wav2vec2-base-960h-fp32-e4661427.onnx",
    url: `${repo}/model.onnx`,
    bytes: 377_887_594,
    sha256: "e46614273f03ff4b87923a965e417fa72004825522cb007c9c25633b8475490d",
    timeoutMs: 1_800_000,
  },
  fp16: {
    filename: "wav2vec2-base-960h-fp16-378348ee.onnx",
    url: `${repo}/model_fp16.onnx`,
    bytes: 189_192_204,
    sha256: "378348ee38b739cc77e77e3fb8502f0f40ed53da0dbf7401b24c25c8fafe03de",
    timeoutMs: 1_200_000,
  },
  int8: {
    filename: "wav2vec2-base-960h-cd5040c1.onnx",
    url: `${repo}/model_quantized.onnx`,
    bytes: 95_286_046,
    sha256: "cd5040c147381580ed73258143dd8e0c28e800a09e74ee42ee2b3e8cb4d760a3",
  },
};
// The default English model, and the one the Docker image ships as its seed.
export const alignmentModel: ModelFile = englishModels[defaultEnglishSubtitleModel];

export async function prepareModel(
  input: ModelInput,
  deps: ModelDeps = { model: alignmentModel, fetch: globalThis.fetch },
): Promise<string> {
  input.signal.throwIfAborted();
  await mkdir(input.cacheDir, { recursive: true, mode: 0o700 });
  const target = join(input.cacheDir, deps.model.filename);
  if (await verified(target, deps.model, input.signal)) return target;
  if (input.seed !== undefined && (await verified(input.seed, deps.model, input.signal)))
    return seedModel(input, input.seed, target);
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
    `The free subtitle model download (${megabytes(deps.model.bytes)}) was interrupted after 3 attempts, so the captions could not be timed. Check your internet connection, then Continue the run.${deps.model === alignmentModel || deps.model === englishModels.fp16 ? smaller : ""}`,
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
        signal: AbortSignal.any([
          input.signal,
          AbortSignal.timeout(deps.model.timeoutMs ?? 300_000),
        ]),
      });
    } catch (error) {
      throw interrupted(error);
    }
    if (!response.ok || response.body === null) {
      const error = new Error(
        `The free subtitle model could not be downloaded (HTTP ${response.status}) from Hugging Face, so the captions could not be timed. Check your internet connection, then Continue the run.`,
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
            throw new Error(
              "The subtitle model failed download size verification: more arrived than the file Slopify expects, so it was thrown away. Continue the run to download it again.",
            );
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
      throw new Error(
        "The subtitle model failed download verification: the file that arrived is not the one Slopify expects, so it was thrown away. Continue the run to download it again.",
      );
    // Each caller writes in its own directory. On Windows a completed concurrent download
    // may already own the final filename; reuse it only after the same verification.
    try {
      await rename(part, target);
    } catch (error) {
      if (await verified(target, deps.model, input.signal)) return target;
      if (!hasErrnoCode(error, "EEXIST") && !hasErrnoCode(error, "EPERM")) throw error;
      await rm(target, { force: true });
      await rename(part, target);
    }
    return target;
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

async function seedModel(input: ModelInput, seed: string, target: string): Promise<string> {
  const staging = await mkdtemp(join(input.cacheDir, ".alignment-seed-"));
  try {
    const part = join(staging, "model.part");
    await copyFile(seed, part);
    await chmod(part, 0o600);
    input.signal.throwIfAborted();
    await rename(part, target);
    return target;
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

const smaller =
  " To download less, pick a smaller model in Settings → Production defaults → Caption timing model.";
function megabytes(bytes: number): string {
  return `${String(Math.round(bytes / 1_000_000))} MB`;
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
    if (hasErrnoCode(error, "ENOENT")) return false;
    throw error;
  }
}
