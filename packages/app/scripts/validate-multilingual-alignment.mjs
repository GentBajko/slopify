#!/usr/bin/env node
// Word-timing validation for one narration: aligns a local audio file against its text in a
// language, the way a render would, and prints how well the timing held up. Run it before
// trusting (or re-tuning) the multilingual model's gates in src/adapters/alignment.
//
//   npm run build -w packages/app      (or: npx tsc -p packages/app/tsconfig.build.json)
//   node packages/app/scripts/validate-multilingual-alignment.mjs \
//     --audio narration.mp3 --text narration.txt --language es \
//     [--cache ./model-cache] [--reference checked.json] [--ffmpeg /usr/bin/ffmpeg] [--json]
//
// --cache      where the model is kept; the first run downloads it there (248 MB for the
//              multilingual model, 95 MB for English), SHA-256 checked. Defaults to a folder
//              beside this script's working directory, never the app's data folder.
// --reference  hand-checked word starts, [{ "index": 12, "start": 4.31 }, ...] (index into
//              the text's words, counting from 0); the script reports the drift from them.
// --transcribe prints what the model hears, window by window with times, instead of
//              aligning; useful for finding where a recording's text starts.
//
// Without a reference, the script still reports a proxy for placement: every word that
// follows a clear pause in the audio should start where the pause ends.

import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";

const dist = new URL("../dist/", import.meta.url);
const load = (path) => import(new URL(path, dist).href);

const { values } = parseArgs({
  options: {
    audio: { type: "string" },
    text: { type: "string" },
    language: { type: "string", default: "en" },
    cache: { type: "string" },
    reference: { type: "string" },
    ffmpeg: { type: "string" },
    json: { type: "boolean", default: false },
    transcribe: { type: "boolean", default: false },
  },
});
if (values.audio === undefined || (values.text === undefined && !values.transcribe)) {
  console.error(
    "Usage: validate-multilingual-alignment.mjs --audio <file> --text <file> --language <code> [--cache <dir>] [--reference <json>] [--transcribe]",
  );
  process.exit(2);
}

let index;
try {
  index = await load("adapters/alignment/index.js");
} catch (error) {
  console.error(
    `The built aligner is missing (${error.message.split("\n")[0]}). Build the app first: npx tsc -p packages/app/tsconfig.build.json`,
  );
  process.exit(2);
}
const { decodeAudio } = await load("adapters/alignment/audio.js");
const { alignmentModel, prepareModel } = await load("adapters/alignment/cache.js");
const { alignmentSpecFor, multilingualModel } = await load("adapters/alignment/multilingual.js");
const { speechShape } = await load("adapters/alignment/sentences.js");
const { languageInfo } = await load("kernel/ports/languages.js");

const language = values.language;
const info = languageInfo(language);
if (info.code !== language) {
  console.error(
    `Unknown language "${language}". Use one of the codes in kernel/ports/languages.ts.`,
  );
  process.exit(2);
}
const english = language === "en";
const cacheDir = resolve(
  values.cache ?? join(process.cwd(), english ? "english-subtitles" : "multilingual-subtitles"),
);
const ffmpeg = values.ffmpeg ?? createRequire(import.meta.url)("ffmpeg-static");
const audioPath = resolve(values.audio);

// Peak memory of this process and the forked alignment worker, sampled every 100 ms (Linux).
let peakKiB = 0;
const sample = () => {
  let total = process.memoryUsage().rss / 1024;
  try {
    const out = execFileSync("ps", ["-o", "rss=", "--ppid", String(process.pid)], {
      encoding: "utf8",
    });
    for (const line of out.split("\n")) total += Number(line.trim()) || 0;
  } catch {
    // No children right now, or no ps: the process's own RSS is the reading.
  }
  peakKiB = Math.max(peakKiB, total);
};
const sampler = setInterval(sample, 100);

const signal = new AbortController().signal;
let downloadShown = -1;
const onDownload = (current, total) => {
  const percent = Math.floor((current / total) * 100);
  if (percent !== downloadShown && percent % 10 === 0) {
    downloadShown = percent;
    process.stderr.write(`model download ${percent}%\n`);
  }
};

if (values.transcribe) {
  await transcribe();
  clearInterval(sampler);
  process.exit(0);
}

const text = await readFile(resolve(values.text), "utf8");
const spec = info.timing === "sentences" ? undefined : alignmentSpecFor(language);
if (spec !== undefined)
  await prepareModel(
    { cacheDir, signal, onProgress: onDownload },
    { model: english ? alignmentModel : multilingualModel, fetch: globalThis.fetch },
  );

const omissions = [];
const started = performance.now();
let words;
let failure;
try {
  words = await index.alignSubtitles({
    audioPath,
    text,
    cacheDir,
    ffmpeg,
    signal,
    ...(english ? {} : { language }),
    onOmission: (omission) => omissions.push(omission),
  });
} catch (error) {
  failure = error;
}
const seconds = (performance.now() - started) / 1000;
clearInterval(sampler);
sample();

const shape = await audioShape();
const textWords = spec === undefined ? text.trim().split(/\s+/) : spec.words(text);
const report = {
  language,
  model:
    spec === undefined
      ? "sentence timing (no model)"
      : english
        ? alignmentModel.filename
        : multilingualModel.filename,
  audioSeconds: round(shape.duration),
  alignSeconds: round(seconds),
  realTimeFactor: round(seconds / shape.duration),
  peakMemoryMiB: Math.round(peakKiB / 1024),
  textWords: textWords.length,
};
if (failure !== undefined) {
  report.failed = failure.message;
  if (failure.name === "SubtitleMismatch")
    Object.assign(report, { at: failure.at, expected: failure.expected, heard: failure.heard });
} else {
  const confidences = words.map((word) => word.confidence).filter((value) => value !== undefined);
  const gates = spec?.gates;
  Object.assign(report, {
    alignedWords: words.length,
    omittedPhrases: omissions.length,
    omittedWords: omissions.reduce((sum, one) => sum + one.text.split(/\s+/).length, 0),
    meanConfidence: confidences.length ? round(mean(confidences)) : null,
    lowConfidenceShare:
      gates && confidences.length
        ? round(confidences.filter((value) => value < gates.poorScore).length / confidences.length)
        : null,
    gates: gates ?? null,
    pauseOnsetDrift: pauseDrift(words, shape),
    referenceDrift: values.reference === undefined ? null : await referenceDrift(words),
    firstWords: words
      .slice(0, 20)
      .map((word) => `${round(word.start)}-${round(word.end)} ${word.text}`),
  });
}
if (values.json) console.log(JSON.stringify(report, null, 2));
else
  for (const [key, value] of Object.entries(report))
    console.log(`${key}: ${typeof value === "object" ? JSON.stringify(value) : value}`);
process.exit(failure === undefined ? 0 : 1);

async function audioShape() {
  const working = await mkdtemp(join(tmpdir(), "slopify-validate-"));
  try {
    const pcm = join(working, "audio.f32");
    await decodeAudio(ffmpeg, audioPath, pcm, signal);
    const bytes = await readFile(pcm);
    const samples = new Float32Array(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + Math.floor(bytes.length / 4) * 4),
    );
    return { ...speechShape(samples), duration: samples.length / 16000, samples };
  } finally {
    await rm(working, { recursive: true, force: true });
  }
}

// A word that starts right after a pause of 300 ms or more should start where the pause ends.
function pauseDrift(timed, shape) {
  const drifts = [];
  for (const pause of shape.pauses) {
    if (pause.end - pause.start < 0.3) continue;
    const next = timed.find((word) => word.start >= pause.start - 0.15);
    if (next === undefined || next.start - pause.end > 1) continue;
    drifts.push(Math.abs(next.start - pause.end));
  }
  if (drifts.length === 0) return null;
  drifts.sort((a, b) => a - b);
  return {
    pauses: drifts.length,
    meanSeconds: round(mean(drifts)),
    medianSeconds: round(drifts[Math.floor(drifts.length / 2)]),
    over200ms: drifts.filter((value) => value > 0.2).length,
  };
}

async function referenceDrift(timed) {
  const checked = JSON.parse(await readFile(resolve(values.reference), "utf8"));
  const drifts = checked
    .map((row) =>
      timed[row.index] === undefined ? undefined : Math.abs(timed[row.index].start - row.start),
    )
    .filter((value) => value !== undefined);
  return drifts.length === 0
    ? null
    : {
        words: drifts.length,
        meanSeconds: round(mean(drifts)),
        maxSeconds: round(Math.max(...drifts)),
      };
}

// What the model hears, 12 s at a time, with the time of each word's first letter.
async function transcribe() {
  const spec = alignmentSpecFor(language);
  const modelPath = await prepareModel(
    { cacheDir, signal, onProgress: onDownload },
    { model: english ? alignmentModel : multilingualModel, fetch: globalThis.fetch },
  );
  const ort = await import(
    createRequire(new URL("../package.json", import.meta.url)).resolve("onnxruntime-node")
  );
  const session = await ort.InferenceSession.create(modelPath, { executionProviders: ["cpu"] });
  const { samples } = await audioShape();
  for (let at = 0; at < samples.length; at += 12 * 16000) {
    const chunk = samples.subarray(at, Math.min(samples.length, at + 12 * 16000));
    let meanValue = 0;
    for (const value of chunk) meanValue += value;
    meanValue /= chunk.length;
    let variance = 0;
    for (const value of chunk) variance += (value - meanValue) ** 2;
    const divisor = Math.sqrt(variance / chunk.length + 1e-7);
    const input = Float32Array.from(chunk, (value) => (value - meanValue) / divisor);
    const result = await session.run({
      input_values: new ort.Tensor("float32", input, [1, chunk.length]),
    });
    const frames = result.logits.dims[1];
    const logits = spec.compact?.(result.logits.data, frames) ?? result.logits.data;
    let previous = -1;
    let line = "";
    let wordStart = true;
    for (let frame = 0; frame < frames; frame += 1) {
      let best = 0;
      for (let label = 1; label < spec.labels; label += 1)
        if (logits[frame * spec.labels + label] > logits[frame * spec.labels + best]) best = label;
      if (best !== previous && best !== 0) {
        const letter = spec.letters[best] ?? "";
        if (letter === " ") wordStart = true;
        else {
          if (wordStart) line += ` [${round(at / 16000 + frame * 0.02)}]`;
          wordStart = false;
          line += letter;
        }
      }
      previous = best;
    }
    console.log(line.trim());
  }
  await session.release();
}

function mean(list) {
  return list.reduce((sum, value) => sum + value, 0) / list.length;
}
function round(value) {
  return Math.round(value * 1000) / 1000;
}
