import { open, readFile, stat } from "node:fs/promises";
import * as ort from "onnxruntime-web/wasm";
import type { TimedWord } from "../../kernel/ports/subtitles.js";
import { mismatch } from "./ctc.js";
import { type WorkerInput, workerInput } from "./protocol.js";
import { type SpeechWord, speechWords } from "./text.js";
import { alignSpeechWindow, greedy } from "./window.js";

const sampleRate = 16000;
const windowSeconds = 12;
const overlapSeconds = 2;

process.once("message", (raw: unknown) => {
  const input = workerInput.safeParse(raw);
  if (!input.success) {
    send({ type: "error", message: "The subtitle worker received an invalid request." });
    return;
  }
  run(input.data).then(
    (words) => send({ type: "done", words }),
    (error: unknown) =>
      send({ type: "error", message: error instanceof Error ? error.message : String(error) }),
  );
});

function send(message: unknown): void {
  process.send?.(message);
}

async function run(input: WorkerInput): Promise<readonly TimedWord[]> {
  ort.env.wasm.numThreads = 1;
  const model = new Uint8Array(await readFile(input.modelPath));
  const session = await ort.InferenceSession.create(model, { executionProviders: ["wasm"] });
  const file = await open(input.pcmPath, "r");
  try {
    const totalSamples = (await stat(input.pcmPath)).size / 4;
    if (!Number.isInteger(totalSamples) || totalSamples < sampleRate / 10)
      throw new Error("The narration is too short to align subtitles.");
    const source = speechWords(input.text);
    const output: TimedWord[] = [];
    let cursor = 0;
    let omitted = 0;
    const omissionBudget = Math.min(60, Math.floor(source.length * 0.05));
    let sampleAt = 0;
    while (sampleAt < totalSamples && cursor < source.length) {
      const count = Math.min(windowSeconds * sampleRate, totalSamples - sampleAt);
      const buffer = Buffer.alloc(count * 4);
      await file.read(buffer, 0, buffer.length, sampleAt * 4);
      const audio = new Float32Array(buffer.buffer, buffer.byteOffset, count);
      const normalized = normalize(audio);
      if (normalized === undefined) {
        sampleAt += count;
        continue;
      }
      const result = await session.run({
        input_values: new ort.Tensor("float32", normalized, [1, count]),
      });
      const logits = result.logits;
      if (
        logits === undefined ||
        !(logits.data instanceof Float32Array) ||
        logits.dims.length !== 3 ||
        logits.dims[2] !== 32
      )
        throw new Error("The local subtitle model returned an unsupported result.");
      const frames = logits.dims[1] ?? 0;
      const observed = greedy(logits.data, frames);
      if (observed.replace(/[^A-Z]/g, "").length === 0) {
        sampleAt += count;
        for (const tensor of Object.values(result)) tensor.dispose();
        continue;
      }
      const candidate = candidates(source, cursor, observed);
      const finalWindow = sampleAt + count >= totalSamples;
      const complete = finalWindow && cursor + candidate.length === source.length;
      const cutoff = finalWindow ? count / sampleRate : count / sampleRate - overlapSeconds;
      const recovered = alignSpeechWindow(
        logits.data,
        frames,
        candidate,
        complete,
        cutoff,
        cursor === 0 ? 0 : omissionBudget - omitted,
      );
      const accepted = recovered.words;
      const last = accepted.at(-1);
      if (last === undefined) throw new Error(mismatch);
      if (recovered.skipped > 0) {
        omitted += recovered.skipped;
        send({
          type: "omission",
          start: sampleAt / sampleRate,
          text: candidate
            .slice(0, recovered.skipped)
            .map((word) => word.text)
            .join(" "),
        });
        cursor += recovered.skipped;
      }
      const offset = sampleAt / sampleRate;
      output.push(
        ...accepted.map((word) => ({
          ...word,
          start: offset + word.start,
          end: offset + word.end,
        })),
      );
      cursor += accepted.length;
      send({ type: "progress", current: cursor, total: source.length });
      // Keep a small leading silence margin but never re-use speech already captioned.
      sampleAt += Math.max(1, Math.floor(last.end * sampleRate));
      for (const tensor of Object.values(result)) tensor.dispose();
    }
    if (cursor !== source.length || output.length === 0) throw new Error(mismatch);
    // A substantial spoken tail absent from the transcript is a mismatch too.
    while (sampleAt + sampleRate < totalSamples) {
      const count = Math.min(windowSeconds * sampleRate, totalSamples - sampleAt);
      const buffer = Buffer.alloc(count * 4);
      await file.read(buffer, 0, buffer.length, sampleAt * 4);
      const audio = normalize(new Float32Array(buffer.buffer, buffer.byteOffset, count));
      if (audio !== undefined) {
        const result = await session.run({
          input_values: new ort.Tensor("float32", audio, [1, count]),
        });
        const logits = result.logits;
        if (
          logits !== undefined &&
          logits.data instanceof Float32Array &&
          greedy(logits.data, logits.dims[1] ?? 0).replace(/[^A-Z]/g, "").length > 8
        )
          throw new Error(mismatch);
        for (const tensor of Object.values(result)) tensor.dispose();
      }
      sampleAt += count;
    }
    return output;
  } finally {
    await file.close();
    await session.release();
  }
}

function candidates(
  source: readonly SpeechWord[],
  cursor: number,
  observed: string,
): readonly SpeechWord[] {
  const selected: SpeechWord[] = [];
  let length = 0;
  for (let index = cursor; index < source.length; index += 1) {
    const word = source[index];
    if (word === undefined) break;
    const normalized = speechWords(word.text, observed)[0];
    if (normalized === undefined) continue;
    if (length + normalized.spoken.length + 1 > 900) break;
    selected.push(normalized);
    length += normalized.spoken.length + 1;
  }
  return selected;
}

function normalize(audio: Float32Array): Float32Array | undefined {
  let mean = 0;
  for (const value of audio) mean += value;
  mean /= audio.length;
  let variance = 0;
  for (const value of audio) variance += (value - mean) ** 2;
  variance /= audio.length;
  if (variance < 1e-10) return undefined;
  const divisor = Math.sqrt(variance + 1e-7);
  return Float32Array.from(audio, (value) => (value - mean) / divisor);
}
