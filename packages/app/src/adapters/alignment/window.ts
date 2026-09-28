import type { TimedWord } from "../../kernel/ports/subtitles.js";
import { alignWindow, frameSeconds } from "./ctc.js";
import { agreesWithSpeech } from "./quality.js";
import { type AlignmentSpec, englishSpec } from "./spec.js";
import type { SpeechWord } from "./text.js";

interface AcceptedWindow {
  readonly words: readonly TimedWord[];
  readonly skipped: number;
  readonly omissionStart: number;
}

// ceiling: the longest run of words a voice may say its own way (a year, an abbreviation, a
// name the model cannot spell) and still be placed between the words around it.
const theirWayWords = 10;
const theirWaySeconds = 6;
// floor: the share of a window's words that must match what is heard, so a recording of
// other words, or of the right words in the wrong order, is still refused.
const matchingShare = 0.6;
// Words either side of a run that hold it in place.
const holdingWords = 3;

// Recovery omits bounded transcript spans only after confirming surrounding speech.
export function alignSpeechWindow(
  logits: Float32Array,
  frames: number,
  candidate: readonly SpeechWord[],
  complete: boolean,
  cutoff: number,
  skipBudget: number,
  spec: AlignmentSpec = englishSpec,
  // The window starts right after words already placed, which hold its first words in place.
  held = true,
): AcceptedWindow {
  const { gates, mismatch } = spec;
  const agrees = (expected: string, observed: string, maximumError: number): boolean =>
    agreesWithSpeech(expected, observed, maximumError, spec.comparable);
  try {
    return {
      words: accepted(logits, frames, candidate, complete, cutoff, spec),
      skipped: 0,
      omissionStart: 0,
    };
  } catch (error) {
    if (!(error instanceof Error) || error.message !== mismatch) throw error;
  }
  // Last, words the voice said its own way: after skipped passages, which leave no words to
  // place and are better told apart.
  const theirWay = (): AcceptedWindow => {
    const said = saidTheirWay(logits, frames, candidate, complete, cutoff, spec, held);
    if (said === undefined) throw new Error(mismatch);
    return { words: said, skipped: 0, omissionStart: 0 };
  };
  if (skipBudget <= 0) return theirWay();
  const heard = greedy(logits, frames, spec).split(/\s+/);
  for (let skipped = 1; skipped <= Math.min(40, skipBudget, candidate.length - 4); skipped += 1) {
    const remaining = candidate.slice(skipped);
    const anchor = remaining
      .slice(0, 4)
      .map((word) => word.spoken)
      .join(" ");
    if (
      spec.lettersOnly(anchor).length < gates.anchorLetters ||
      !agrees(anchor, heard.slice(0, anchor.split(/\s+/).length).join(" "), 0.2)
    )
      continue;
    try {
      const words = accepted(logits, frames, remaining, complete, cutoff, spec);
      if (
        words.length < 4 ||
        words.slice(0, 4).some((word) => (word.confidence ?? 0) < gates.anchorConfidence)
      )
        continue;
      return { words, skipped, omissionStart: 0 };
    } catch (error) {
      if (!(error instanceof Error) || error.message !== mismatch) throw error;
    }
  }
  const observed = spec.comparable(greedy(logits, frames, spec));
  for (let start = candidate.length - 4; start >= 4; start -= 1) {
    const prefix = spec.comparable(
      candidate
        .slice(0, start)
        .map((word) => word.spoken)
        .join(""),
    );
    if (prefix.length > observed.length) continue;
    if (!agrees(prefix, observed.slice(0, prefix.length), 0.2)) continue;
    for (
      let skipped = 1;
      skipped <= Math.min(40, skipBudget, candidate.length - start - 4);
      skipped += 1
    ) {
      const remaining = [...candidate.slice(0, start), ...candidate.slice(start + skipped)];
      const anchor = spec.comparable(
        remaining
          .slice(start, start + 4)
          .map((word) => word.spoken)
          .join(""),
      );
      if (
        anchor.length < gates.anchorLetters ||
        !agrees(anchor, observed.slice(prefix.length, prefix.length + anchor.length), 0.2) ||
        !agrees(prefix + anchor, observed.slice(0, prefix.length + anchor.length), 0.15)
      )
        continue;
      try {
        const words = accepted(logits, frames, remaining, complete, cutoff, spec, 0.2);
        if (
          words.length < start + 4 ||
          words
            .slice(start - 4, start + 4)
            .some((word) => (word.confidence ?? 0) < gates.anchorConfidence)
        )
          continue;
        return { words, skipped, omissionStart: start };
      } catch (error) {
        if (!(error instanceof Error) || error.message !== mismatch) throw error;
      }
    }
  }
  return theirWay();
}

// The window's words when all that differs from what is heard is short runs the voice said its
// own way ("eleven o four" for 1104, "Saint" for St., a name heard as other letters):
// forced alignment still places every word, and each run sits between words that match on both
// sides, so its captions keep time with the ones around it. A run that reaches the end of the
// window is left for the next one, which starts right before it. Undefined when the words do
// not match enough of the window, or a run is too long or has nothing holding it.
export function saidTheirWay(
  logits: Float32Array,
  frames: number,
  candidate: readonly SpeechWord[],
  complete: boolean,
  cutoff: number,
  spec: AlignmentSpec,
  held: boolean,
): readonly TimedWord[] | undefined {
  let words: readonly TimedWord[];
  try {
    words = alignWindow(logits, frames, candidate, complete, spec).words.filter(
      (word) => word.end <= cutoff,
    );
  } catch (error) {
    if (error instanceof Error && error.message === spec.mismatch) return undefined;
    throw error;
  }
  if (words.length < holdingWords + 1) return undefined;
  const matches = words.map((word, index) => {
    const expected = candidate[index]?.spoken ?? "";
    // A word too short to tell apart takes its neighbours' word for it.
    if (spec.lettersOnly(expected).length < 3) return true;
    const heard = greedyBetween(
      logits,
      Math.floor(word.start / frameSeconds),
      Math.min(frames, Math.ceil(word.end / frameSeconds)),
      spec,
    );
    return agreesWithSpeech(expected, heard, 0.5, spec.comparable);
  });
  if (matches.filter(Boolean).length < words.length * matchingShare) return undefined;
  let keep = words.length;
  for (let start = 0; start < words.length; start += 1) {
    if (matches[start]) continue;
    let end = start;
    while (end < words.length && !matches[end]) end += 1;
    const after = matches.slice(end, end + holdingWords);
    const heldAfter = after.length === holdingWords && after.every(Boolean);
    const heldBefore = start === 0 ? held : matches[start - 1] === true;
    const first = words[start];
    const last = words[end - 1];
    if (
      first === undefined ||
      last === undefined ||
      end - start > theirWayWords ||
      last.end - first.start > theirWaySeconds
    )
      return undefined;
    if (!heldAfter) {
      // Nothing after it in this window: the next window starts before the run.
      keep = start;
      break;
    }
    if (!heldBefore) return undefined;
    start = end;
  }
  if (keep < holdingWords) return undefined;
  return words
    .slice(0, keep)
    .map((word, index) => (matches[index] ? word : { ...word, confidence: 0 }));
}

function accepted(
  logits: Float32Array,
  frames: number,
  candidate: readonly SpeechWord[],
  complete: boolean,
  cutoff: number,
  spec: AlignmentSpec,
  maximumError = spec.gates.maximumError,
): readonly TimedWord[] {
  const words = alignWindow(logits, frames, candidate, complete, spec).words.filter(
    (word) => word.end <= cutoff,
  );
  const last = words.at(-1);
  if (
    last === undefined ||
    !agreesWithSpeech(
      candidate
        .slice(0, words.length)
        .map((word) => word.spoken)
        .join(" "),
      greedy(logits, Math.min(frames, Math.ceil(last.end / frameSeconds)), spec),
      maximumError,
      spec.comparable,
    )
  )
    throw new Error(spec.mismatch);
  return words;
}

export function greedy(
  logits: Float32Array,
  frames: number,
  spec: AlignmentSpec = englishSpec,
): string {
  return greedyBetween(logits, 0, frames, spec);
}

// What the model heard between two frames.
function greedyBetween(
  logits: Float32Array,
  from: number,
  to: number,
  spec: AlignmentSpec = englishSpec,
): string {
  const labels = spec.labels;
  let previous = -1;
  let text = "";
  for (let frame = from; frame < to; frame += 1) {
    let best = 0;
    for (let label = 1; label < labels; label += 1)
      if (
        (logits[frame * labels + label] ?? -Infinity) > (logits[frame * labels + best] ?? -Infinity)
      )
        best = label;
    if (best !== previous && best !== 0) text += spec.letters[best] ?? "";
    previous = best;
  }
  return text.trim().replace(/\s+/g, " ");
}
