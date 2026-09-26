import type { TimedWord } from "../../kernel/ports/subtitles.js";
import { splitEndMatter } from "../article/split.js";

// Where each chapter of the video starts. The YouTube description step writes chapters with
// real times when it runs; without it, the article's top-level headings are the chapters and
// the word timing says when each is spoken. The narration reads the headings aloud (the plain
// text the narration comes from keeps them as paragraphs), so a heading is found by its own
// words near where its share of the article says it should be.

export interface TimedChapter {
  readonly title: string;
  // Seconds into the final video.
  readonly start: number;
}

interface Heading {
  readonly level: number;
  readonly title: string;
  // How many words of the article come before it.
  readonly at: number;
}

// ceiling: a heading is looked for within 200 words either side of where its share of the
// article puts it; past that, a rewritten narration has drifted too far to trust a match.
const searchWords = 200;
// The heading's first words that have to match, in order.
const matchWords = 4;

export function headingChapters(
  markdown: string,
  words: readonly TimedWord[],
): readonly TimedChapter[] {
  if (words.length === 0) return [];
  const headings = topHeadings(splitEndMatter(markdown).body);
  const articleWords = tokens(splitEndMatter(markdown).body).length;
  if (headings.length === 0 || articleWords === 0) return [];
  const spoken = words.map((word) => normalise(word.text));
  const chapters: TimedChapter[] = [];
  let after = -1;
  for (const heading of headings) {
    const estimate = Math.round((heading.at / articleWords) * words.length);
    const wanted = tokens(heading.title).slice(0, matchWords);
    const found = findNear(spoken, wanted, estimate, after + 1);
    const index = found ?? Math.max(after + 1, Math.min(estimate, words.length - 1));
    const word = words[index];
    if (word === undefined || index <= after) continue;
    chapters.push({ title: heading.title, start: word.start });
    after = index;
  }
  return chapters;
}

// The article's chapter headings: the highest level used, except a lone title heading at the
// very top, which names the article rather than a part of it.
export function topHeadings(markdown: string): readonly Heading[] {
  const found: Heading[] = [];
  let fenced = false;
  let before = 0;
  for (const line of markdown.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
    const matched = fenced ? null : /^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (matched?.[1] !== undefined && matched[2] !== undefined) {
      const title = plainHeading(matched[2]);
      if (title !== "") found.push({ level: matched[1].length, title, at: before });
    }
    before += tokens(line).length;
  }
  if (found.length === 0) return [];
  const top = Math.min(...found.map((heading) => heading.level));
  const atTop = found.filter((heading) => heading.level === top);
  const first = found[0];
  if (atTop.length === 1 && first !== undefined && first.level === top && found.length > 1) {
    const rest = found.slice(1);
    const next = Math.min(...rest.map((heading) => heading.level));
    return rest.filter((heading) => heading.level === next);
  }
  return atTop;
}

function plainHeading(text: string): string {
  return text
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_`~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(text: string): readonly string[] {
  return text
    .split(/\s+/)
    .map(normalise)
    .filter((token) => token !== "");
}

function normalise(word: string): string {
  return word.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

// The start of the run of `wanted` in `spoken` nearest to `estimate`, at or after `from`.
function findNear(
  spoken: readonly string[],
  wanted: readonly string[],
  estimate: number,
  from: number,
): number | undefined {
  if (wanted.length === 0) return undefined;
  const low = Math.max(from, estimate - searchWords);
  const high = Math.min(spoken.length - wanted.length, estimate + searchWords);
  let best: number | undefined;
  for (let at = low; at <= high; at += 1) {
    if (!wanted.every((token, offset) => spoken[at + offset] === token)) continue;
    if (best === undefined || Math.abs(at - estimate) < Math.abs(best - estimate)) best = at;
  }
  return best;
}
