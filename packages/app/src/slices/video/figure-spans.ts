import type { TimedWord } from "../../kernel/ports/subtitles.js";

// Where each described block is spoken: its passage found in the narration's word timing, in
// order, so the video can show the block's card for exactly that stretch. The aligner may
// write a word differently from the text (a number spelled out, punctuation dropped), so a
// passage is found by its first and last few words, most of which must match.

export interface FigureSpan {
  readonly start: number;
  readonly end: number;
}

// ceiling: the words compared at each end of a passage, and how many of them must match.
const edgeWords = 4;
const matchShare = 0.75;

export function passageSpans(
  words: readonly TimedWord[],
  passages: readonly string[],
): readonly (FigureSpan | undefined)[] {
  const flat: { token: string; word: number }[] = [];
  for (const [index, word] of words.entries())
    for (const token of tokens(word.text)) flat.push({ token, word: index });
  let cursor = 0;
  return passages.map((passage) => {
    const wanted = tokens(passage);
    if (wanted.length === 0) return undefined;
    const k = Math.min(edgeWords, wanted.length);
    const head = wanted.slice(0, k);
    const start = find(flat, head, cursor, flat.length);
    if (start === undefined) return undefined;
    const tail = wanted.slice(-k);
    const from = start + Math.max(0, Math.floor(wanted.length / 2) - k);
    const to = Math.min(flat.length, start + Math.ceil(wanted.length * 1.5) + k);
    const last = find(flat, tail, from, to);
    const endToken = Math.min(
      flat.length - 1,
      last === undefined ? start + wanted.length - 1 : last + k - 1,
    );
    cursor = endToken + 1;
    const first = words[flat[start]?.word ?? 0];
    const final = words[flat[endToken]?.word ?? 0];
    return first === undefined || final === undefined
      ? undefined
      : { start: first.start, end: Math.max(first.start, final.end) };
  });
}

function find(
  flat: readonly { token: string }[],
  wanted: readonly string[],
  from: number,
  to: number,
): number | undefined {
  const need = Math.ceil(wanted.length * matchShare);
  for (
    let at = from;
    at + wanted.length <= Math.max(to, from + wanted.length) && at + wanted.length <= flat.length;
    at++
  ) {
    let hits = 0;
    for (const [offset, token] of wanted.entries())
      if (flat[at + offset]?.token === token) hits += 1;
    if (hits >= need) return at;
  }
  return undefined;
}

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}
