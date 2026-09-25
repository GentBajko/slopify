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
