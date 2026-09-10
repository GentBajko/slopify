import type { TimedWord } from "../../kernel/ports/subtitles.js";
import { alignWindow, frameSeconds, mismatch } from "./ctc.js";
import { agreesWithSpeech } from "./quality.js";
import type { SpeechWord } from "./text.js";
import { letters } from "./vocabulary.js";

interface AcceptedWindow {
  readonly words: readonly TimedWord[];
  readonly skipped: number;
  readonly omissionStart: number;
}

// Recovery omits bounded transcript spans only after confirming surrounding speech.
export function alignSpeechWindow(
  logits: Float32Array,
  frames: number,
  candidate: readonly SpeechWord[],
  complete: boolean,
  cutoff: number,
  skipBudget: number,
): AcceptedWindow {
  try {
    return {
      words: accepted(logits, frames, candidate, complete, cutoff),
      skipped: 0,
      omissionStart: 0,
    };
  } catch (error) {
    if (!(error instanceof Error) || error.message !== mismatch) throw error;
  }
  if (skipBudget <= 0) throw new Error(mismatch);
  const heard = greedy(logits, frames).split(/\s+/);
  for (let skipped = 1; skipped <= Math.min(40, skipBudget, candidate.length - 4); skipped += 1) {
    const remaining = candidate.slice(skipped);
    const anchor = remaining
      .slice(0, 4)
      .map((word) => word.spoken)
      .join(" ");
    if (
      anchor.replace(/[^A-Z]/g, "").length < 20 ||
      !agreesWithSpeech(anchor, heard.slice(0, anchor.split(/\s+/).length).join(" "), 0.2)
    )
      continue;
    try {
      const words = accepted(logits, frames, remaining, complete, cutoff);
      if (words.length < 4 || words.slice(0, 4).some((word) => (word.confidence ?? 0) < 0.75))
        continue;
      return { words, skipped, omissionStart: 0 };
    } catch (error) {
      if (!(error instanceof Error) || error.message !== mismatch) throw error;
    }
  }
  const observed = greedy(logits, frames).replace(/[^A-Z']/g, "");
  for (let start = candidate.length - 4; start >= 4; start -= 1) {
    const prefix = candidate
      .slice(0, start)
      .map((word) => word.spoken)
      .join("")
      .replace(/[^A-Z']/g, "");
    if (prefix.length > observed.length) continue;
    if (!agreesWithSpeech(prefix, observed.slice(0, prefix.length), 0.2)) continue;
    for (
      let skipped = 1;
      skipped <= Math.min(40, skipBudget, candidate.length - start - 4);
      skipped += 1
    ) {
      const remaining = [...candidate.slice(0, start), ...candidate.slice(start + skipped)];
      const anchor = remaining
        .slice(start, start + 4)
        .map((word) => word.spoken)
        .join("")
        .replace(/[^A-Z']/g, "");
      if (
        anchor.length < 20 ||
        !agreesWithSpeech(
          anchor,
          observed.slice(prefix.length, prefix.length + anchor.length),
          0.2,
        ) ||
        !agreesWithSpeech(prefix + anchor, observed.slice(0, prefix.length + anchor.length), 0.15)
      )
        continue;
      try {
        const words = accepted(logits, frames, remaining, complete, cutoff, 0.2);
        if (
          words.length < start + 4 ||
          words.slice(start - 4, start + 4).some((word) => (word.confidence ?? 0) < 0.75)
        )
          continue;
        return { words, skipped, omissionStart: start };
      } catch (error) {
        if (!(error instanceof Error) || error.message !== mismatch) throw error;
      }
    }
  }
  throw new Error(mismatch);
}

function accepted(
  logits: Float32Array,
  frames: number,
  candidate: readonly SpeechWord[],
  complete: boolean,
  cutoff: number,
  maximumError = 0.42,
): readonly TimedWord[] {
  const words = alignWindow(logits, frames, candidate, complete).words.filter(
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
      greedy(logits, Math.min(frames, Math.ceil(last.end / frameSeconds))),
      maximumError,
    )
  )
    throw new Error(mismatch);
  return words;
}

export function greedy(logits: Float32Array, frames: number): string {
  let previous = -1;
  let text = "";
  for (let frame = 0; frame < frames; frame += 1) {
    let best = 0;
    for (let label = 1; label < 32; label += 1)
      if ((logits[frame * 32 + label] ?? -Infinity) > (logits[frame * 32 + best] ?? -Infinity))
        best = label;
    if (best !== previous && best !== 0) text += letters[best] ?? "";
    previous = best;
  }
  return text.trim().replace(/\s+/g, " ");
}
