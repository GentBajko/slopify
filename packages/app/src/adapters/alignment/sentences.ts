import type { TimedWord } from "../../kernel/ports/subtitles.js";

// Timing for a language no model can align: each sentence gets the share of the speech its
// length asks for, moved to the nearest pause the narration actually makes, and its words
// share the sentence by length. Good enough for sentence captions; not for word-by-word
// captions or cuts, which the app turns off for these languages.

export interface SpeechShape {
  // Seconds from the start of the file.
  readonly speechStart: number;
  readonly speechEnd: number;
  // Quiet stretches inside the speech, in order.
  readonly pauses: readonly { readonly start: number; readonly end: number }[];
}

const frameSeconds = 0.02;
const shortestPause = 0.2;

// Loudness per 20 ms frame, then a threshold between the quiet floor and the loud level.
export function speechShape(samples: Float32Array, sampleRate = 16000): SpeechShape {
  const size = Math.round(sampleRate * frameSeconds);
  const frames = Math.floor(samples.length / size);
  const duration = samples.length / sampleRate;
  if (frames === 0) return { speechStart: 0, speechEnd: duration, pauses: [] };
  const levels = new Float32Array(frames);
  for (let frame = 0; frame < frames; frame += 1) {
    let sum = 0;
    for (let index = frame * size; index < (frame + 1) * size; index += 1)
      sum += (samples[index] ?? 0) ** 2;
    levels[frame] = Math.sqrt(sum / size);
  }
  const sorted = Float32Array.from(levels).sort();
  const floor = sorted[Math.floor(frames * 0.1)] ?? 0;
  const loud = sorted[Math.floor(frames * 0.9)] ?? 0;
  if (loud <= floor) return { speechStart: 0, speechEnd: duration, pauses: [] };
  const threshold = floor + (loud - floor) * 0.15;
  const quiet = Array.from(levels, (level) => level < threshold);
  const first = quiet.indexOf(false);
  const last = quiet.lastIndexOf(false);
  if (first === -1) return { speechStart: 0, speechEnd: duration, pauses: [] };
  const pauses: { start: number; end: number }[] = [];
  let runStart = -1;
  for (let frame = first; frame <= last; frame += 1) {
    if (quiet[frame] === true) {
      if (runStart === -1) runStart = frame;
    } else if (runStart !== -1) {
      if ((frame - runStart) * frameSeconds >= shortestPause)
        pauses.push({ start: runStart * frameSeconds, end: frame * frameSeconds });
      runStart = -1;
    }
  }
  return { speechStart: first * frameSeconds, speechEnd: (last + 1) * frameSeconds, pauses };
}

export function sentencesOf(text: string, language: string): readonly string[] {
  const segmenter = new Intl.Segmenter(language, { granularity: "sentence" });
  return Array.from(segmenter.segment(text), (part) => part.segment.trim()).filter(
    (sentence) => sentence !== "",
  );
}

// Letters and digits: what takes time to say. Punctuation and spaces do not.
const weight = (text: string): number => Math.max(1, text.replace(/[^\p{L}\p{N}]/gu, "").length);

export function sentenceTiming(
  text: string,
  language: string,
  shape: SpeechShape,
): readonly TimedWord[] {
  const sentences = sentencesOf(text, language);
  if (sentences.length === 0) return [];
  const span = Math.max(0.1, shape.speechEnd - shape.speechStart);
  const weights = sentences.map(weight);
  const total = weights.reduce((sum, value) => sum + value, 0);
  // How far a boundary may move to reach a pause: most of an average sentence, since letters
  // are a rough measure of speaking time.
  const reach = (span / sentences.length) * 0.75;
  const bounds = [shape.speechStart];
  let covered = 0;
  for (const value of weights.slice(0, -1)) {
    covered += value;
    const estimate = shape.speechStart + (span * covered) / total;
    const previous = bounds.at(-1) ?? shape.speechStart;
    let best = estimate;
    let distance = reach;
    for (const pause of shape.pauses) {
      const middle = (pause.start + pause.end) / 2;
      if (middle <= previous + 0.1) continue;
      if (Math.abs(middle - estimate) < distance) {
        best = middle;
        distance = Math.abs(middle - estimate);
      }
    }
    bounds.push(Math.min(shape.speechEnd - 0.05, Math.max(previous + 0.05, best)));
  }
  bounds.push(shape.speechEnd);
  const words: TimedWord[] = [];
  for (const [index, sentence] of sentences.entries()) {
    const start = bounds[index] ?? 0;
    const end = Math.max(start + 0.05, bounds[index + 1] ?? start);
    const parts = sentence.split(/\s+/).filter((part) => part !== "");
    const shares = parts.map(weight);
    const sum = shares.reduce((total, value) => total + value, 0);
    let at = start;
    for (const [position, part] of parts.entries()) {
      const next =
        position === parts.length - 1 ? end : at + ((end - start) * (shares[position] ?? 1)) / sum;
      words.push({ text: part, start: round(at), end: round(next) });
      at = next;
    }
  }
  return words;
}

const round = (seconds: number): number => Math.round(seconds * 1000) / 1000;
