import type { TimedWord } from "../../kernel/ports/subtitles.js";
import type { SpeechWord } from "./text.js";
import { vocabulary } from "./vocabulary.js";

export const frameSeconds = 0.02;
export const mismatch =
  "The audio does not closely match the English transcript. Check the article and audio, including any intro or outro, before generating subtitles.";
export interface WindowAlignment {
  readonly words: readonly TimedWord[];
  readonly confidence: number;
}

interface Tokens {
  readonly ids: readonly number[];
  readonly owners: readonly number[];
  readonly ends: readonly number[];
}

export function alignWindow(
  logits: Float32Array,
  frames: number,
  words: readonly SpeechWord[],
  complete: boolean,
): WindowAlignment {
  if (frames < 1 || frames > 1100 || logits.length !== frames * 32)
    throw new Error("The subtitle alignment window exceeds its safe size.");
  const tokens = tokenize(words);
  if (tokens.ids.length === 0 || tokens.ids.length > 1500)
    throw new Error("The subtitle transcript window exceeds its safe size.");
  const states = [0];
  for (const id of tokens.ids) states.push(id, 0);
  const probabilities = logSoftmax(logits, frames);
  const width = states.length;
  const back = new Uint8Array(frames * width);
  let previous = new Float32Array(width).fill(-Infinity);
  previous[0] = 0;
  for (let frame = 0; frame < frames; frame += 1) {
    const current = new Float32Array(width).fill(-Infinity);
    for (let state = 0; state < Math.min(width, frame * 2 + 3); state += 1) {
      let score = previous[state] ?? -Infinity;
      let step = 0;
      if (state > 0 && (previous[state - 1] ?? -Infinity) > score) {
        score = previous[state - 1] ?? -Infinity;
        step = 1;
      }
      if (
        state > 1 &&
        states[state] !== 0 &&
        states[state] !== states[state - 2] &&
        (previous[state - 2] ?? -Infinity) > score
      ) {
        score = previous[state - 2] ?? -Infinity;
        step = 2;
      }
      current[state] = score + (probabilities[frame * 32 + (states[state] ?? 0)] ?? -Infinity);
      back[frame * width + state] = step;
    }
    previous = current;
  }
  const state = endState(previous, tokens, complete);
  if (!Number.isFinite(previous[state])) throw new Error(mismatch);
  const traced = trace(back, states, tokens, words, probabilities, frames, state);
  if (traced.length === 0) throw new Error(mismatch);
  const confidence = traced.reduce((sum, word) => sum + (word.confidence ?? 0), 0) / traced.length;
  const poor = traced.filter((word) => (word.confidence ?? 0) < 0.2).length / traced.length;
  if (confidence < 0.48 || poor > 0.3) throw new Error(mismatch);
  return { words: traced, confidence };
}

function tokenize(words: readonly SpeechWord[]): Tokens {
  const ids: number[] = [],
    owners: number[] = [],
    ends: number[] = [];
  for (const [index, word] of words.entries()) {
    if (index > 0) {
      ids.push(4);
      owners.push(-1);
    }
    for (const letter of word.spoken.replaceAll(" ", "|")) {
      const id = vocabulary[letter];
      if (id !== undefined) {
        ids.push(id);
        owners.push(index);
      }
    }
    ends.push(ids.length * 2 - 1);
  }
  return { ids, owners, ends };
}

function endState(scores: Float32Array, tokens: Tokens, complete: boolean): number {
  if (complete)
    return (scores.at(-1) ?? -Infinity) > (scores.at(-2) ?? -Infinity)
      ? scores.length - 1
      : scores.length - 2;
  let best = 0;
  for (const end of tokens.ends) {
    for (const state of [end, end + 1, end + 2]) {
      if ((scores[state] ?? -Infinity) > (scores[best] ?? -Infinity)) best = state;
    }
  }
  return best;
}

function trace(
  back: Uint8Array,
  states: readonly number[],
  tokens: Tokens,
  words: readonly SpeechWord[],
  probabilities: Float32Array,
  frames: number,
  finalState: number,
): readonly TimedWord[] {
  const found = words.map((word) => ({
    text: word.text,
    start: Infinity,
    end: 0,
    score: 0,
    count: 0,
  }));
  let state = finalState;
  for (let frame = frames - 1; frame >= 0; frame -= 1) {
    if (state % 2 === 1) {
      const owner = tokens.owners[(state - 1) / 2] ?? -1;
      const word = found[owner];
      if (word !== undefined) {
        word.start = Math.min(word.start, frame * frameSeconds);
        word.end = Math.max(word.end, (frame + 1) * frameSeconds);
        word.score += Math.exp(probabilities[frame * 32 + (states[state] ?? 0)] ?? -Infinity);
        word.count += 1;
      }
    }
    state -= back[frame * states.length + state] ?? 0;
  }
  return found.flatMap((word, index) => {
    if (word.count === 0 || (tokens.ends[index] ?? Infinity) > finalState) return [];
    return [
      { text: word.text, start: word.start, end: word.end, confidence: word.score / word.count },
    ];
  });
}

function logSoftmax(logits: Float32Array, frames: number): Float32Array {
  const result = new Float32Array(logits.length);
  for (let frame = 0; frame < frames; frame += 1) {
    const offset = frame * 32;
    let max = -Infinity;
    for (let label = 0; label < 32; label += 1)
      max = Math.max(max, logits[offset + label] ?? -Infinity);
    let sum = 0;
    for (let label = 0; label < 32; label += 1)
      sum += Math.exp((logits[offset + label] ?? -Infinity) - max);
    const divisor = max + Math.log(sum);
    for (let label = 0; label < 32; label += 1)
      result[offset + label] = (logits[offset + label] ?? -Infinity) - divisor;
  }
  return result;
}
