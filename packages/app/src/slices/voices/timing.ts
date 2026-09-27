import type { TimedWord } from "../../kernel/ports/subtitles.js";

// Which speaker said each timed word. The aligner hands back the transcript's own words, in
// order, sometimes joining a word that has no sound of its own ("-", "&") onto the one before
// and leaving out what it could not hear; so each timed word is found by its first token in
// what is left of the transcript, and a word it cannot find keeps the speaker before it.

export interface SpokenTurn {
  readonly speaker: string;
  readonly turn: number;
  readonly text: string;
}
export interface SpeakerWord extends TimedWord {
  readonly speaker?: string | undefined;
  readonly turn?: number | undefined;
}

// How far ahead a word is looked for: past it, the aligner is more likely to have left the
// word out than the transcript to hold that many words it did not hear.
const lookahead = 60;

export function attributeWords(
  turns: readonly SpokenTurn[],
  words: readonly TimedWord[],
): readonly SpeakerWord[] {
  const tokens = turns.flatMap((turn) =>
    turn.text
      .trim()
      .split(/\s+/)
      .filter((token) => token !== "")
      .map((token) => ({ token, speaker: turn.speaker, turn: turn.turn })),
  );
  const first = tokens[0];
  let at = 0;
  let speaker = first?.speaker;
  let turn = first?.turn;
  return words.map((word) => {
    const parts = word.text.trim().split(/\s+/);
    const head = parts[0] ?? "";
    for (let look = at; look < Math.min(tokens.length, at + lookahead); look += 1) {
      const token = tokens[look];
      if (token === undefined || token.token !== head) continue;
      speaker = token.speaker;
      turn = token.turn;
      at = look + parts.length;
      break;
    }
    return speaker === undefined ? word : { ...word, speaker, turn };
  });
}

// Who speaks a caption cue edited by hand: the speaker whose words fill most of its time, or,
// for a cue moved into a pause, the speaker of the nearest word. Undefined when no word has a
// speaker (a one-voice run).
export function cueSpeaker(
  cue: { readonly start: number; readonly end: number },
  words: readonly Pick<SpeakerWord, "start" | "end" | "speaker">[],
): string | undefined {
  const overlap = new Map<string, number>();
  let nearest: { speaker: string; distance: number } | undefined;
  for (const word of words) {
    if (word.speaker === undefined) continue;
    const shared = Math.min(cue.end, word.end) - Math.max(cue.start, word.start);
    if (shared > 0) overlap.set(word.speaker, (overlap.get(word.speaker) ?? 0) + shared);
    const distance = Math.max(0, word.start - cue.end, cue.start - word.end);
    if (nearest === undefined || distance < nearest.distance)
      nearest = { speaker: word.speaker, distance };
  }
  let best: [string, number] | undefined;
  for (const entry of overlap) if (best === undefined || entry[1] > best[1]) best = entry;
  return best?.[0] ?? nearest?.speaker;
}

// Where each turn starts on the final timeline: its first timed word.
export function turnStarts(words: readonly SpeakerWord[]): ReadonlyMap<number, number> {
  const starts = new Map<number, number>();
  for (const word of words)
    if (word.turn !== undefined && !starts.has(word.turn)) starts.set(word.turn, word.start);
  return starts;
}
