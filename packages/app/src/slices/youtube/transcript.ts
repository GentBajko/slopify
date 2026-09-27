import type { TimedWord } from "../../kernel/ports/subtitles.js";
import { youtubeTimestamp } from "./timestamps.js";

export interface TranscriptPassage {
  // Seconds into the final video: the word times already count the silence at the start,
  // the intro and the gaps (`runtime-subtitles.ts` offsets every segment before saving).
  readonly start: number;
  readonly text: string;
}

// ceiling: a passage closes at the first sentence end after 20 s, so a chapter can start at
// most one passage late, and a 108-minute narration comes to about 300 lines instead of a
// thousand sentences. A pause of 1.5 s (the gap between intro, body and outro, or a long
// breath) always closes one; a passage with no sentence end closes at 60 s.
const passageSeconds = 20;
const pauseSeconds = 1.5;
const longestSeconds = 60;

export function transcriptPassages(words: readonly TimedWord[]): readonly TranscriptPassage[] {
  const passages: TranscriptPassage[] = [];
  let pending: TimedWord[] = [];
  const flush = (): void => {
    const first = pending[0];
    if (first !== undefined)
      passages.push({
        start: first.start,
        text: pending
          .map((word) => word.text.replace(/\s+/g, " ").trim())
          .filter((text) => text !== "")
          .join(" "),
      });
    pending = [];
  };
  for (const word of words) {
    const first = pending[0];
    const last = pending.at(-1);
    if (
      first !== undefined &&
      last !== undefined &&
      (word.start - last.end >= pauseSeconds || word.end - first.start > longestSeconds)
    )
      flush();
    pending.push(word);
    const opening = pending[0];
    if (
      opening !== undefined &&
      word.end - opening.start >= passageSeconds &&
      /[.!?]["'’”)]*$/.test(word.text)
    )
      flush();
  }
  flush();
  return passages.filter((passage) => passage.text !== "");
}

// One passage per line, each led by its start as YouTube writes it: the model copies these
// times into its chapters.
export function transcriptText(passages: readonly TranscriptPassage[]): string {
  return passages
    .map((passage) => `[${youtubeTimestamp(passage.start)}] ${passage.text}`)
    .join("\n");
}

export interface TranscriptSentence {
  // 1-based, as the Shorts step numbers them for the model.
  readonly number: number;
  // Seconds into the final video, like the passages': the first word's start and the last
  // word's end.
  readonly start: number;
  readonly end: number;
  readonly text: string;
  // Where the sentence's words sit in the word list it was built from, first and last
  // inclusive, so a clip cut at sentence edges knows exactly which words it holds.
  readonly firstWord: number;
  readonly lastWord: number;
  // Who says it, on a multi-voice run.
  readonly speaker?: string | undefined;
}
type VoicedWord = TimedWord & {
  readonly speaker?: string | undefined;
  readonly turn?: number | undefined;
};

// ceiling: a sentence with no full stop in 30 s (a list read out, a transcript without
// punctuation) is closed there, so no single number spans more than a short can hold.
const sentenceLongestSeconds = 30;

// The narration as numbered sentences, for the Shorts step: the model picks clips by
// sentence number and Slopify cuts at the sentences' own word times, so a clip never starts
// or ends mid-word. A sentence closes at its full stop, question or exclamation mark, at a
// pause of 1.5 s (the gap between intro, body and outro), or after 30 s. On a multi-voice run
// it also closes where one speaker's turn ends, so a clip always starts and ends on a turn's
// sentence and never cuts a speaker off mid-line.
export function transcriptSentences(words: readonly VoicedWord[]): readonly TranscriptSentence[] {
  const sentences: TranscriptSentence[] = [];
  let first = -1;
  const flush = (last: number): void => {
    if (first < 0 || last < first) return;
    const span = words.slice(first, last + 1);
    const text = span
      .map((word) => word.text.replace(/\s+/g, " ").trim())
      .filter((one) => one !== "")
      .join(" ");
    const opening = span[0];
    const closing = span.at(-1);
    if (text !== "" && opening !== undefined && closing !== undefined)
      sentences.push({
        number: sentences.length + 1,
        start: opening.start,
        end: closing.end,
        text,
        firstWord: first,
        lastWord: last,
        ...(opening.speaker === undefined ? {} : { speaker: opening.speaker }),
      });
    first = -1;
  };
  for (const [index, word] of words.entries()) {
    const previous = words[index - 1];
    const opening = first < 0 ? undefined : words[first];
    if (
      opening !== undefined &&
      previous !== undefined &&
      (word.start - previous.end >= pauseSeconds ||
        word.turn !== previous.turn ||
        word.end - opening.start > sentenceLongestSeconds)
    )
      flush(index - 1);
    if (first < 0) first = index;
    if (/[.!?]["'’”)]*$/.test(word.text.trim())) flush(index);
  }
  flush(words.length - 1);
  return sentences;
}

// One sentence per line, led by its number and its span in the video, which is what the
// model picks from; on a multi-voice run, with the speaker's name before the words.
export function sentencesText(
  sentences: readonly TranscriptSentence[],
  names?: Readonly<Record<string, string>>,
): string {
  return sentences
    .map((sentence) => {
      const name = sentence.speaker === undefined ? undefined : names?.[sentence.speaker];
      return `[${String(sentence.number)}] (${youtubeTimestamp(sentence.start)}-${youtubeTimestamp(sentence.end)}) ${name === undefined ? "" : `${name}: `}${sentence.text}`;
    })
    .join("\n");
}
