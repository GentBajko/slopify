// A post's words: counted the way each site counts them, cut to fit at a sentence, with the
// hashtags and link at the end. Pure and browser-safe: Prepare upload's live counter uses it.

import { parseTimestamp } from "../youtube/timestamps.js";
import type { PlatformLimits } from "./limits.js";

const urlPattern = /https?:\/\/[^\s]+/gu;
// X counts a link as 23 characters, whatever its length.
const xUrlWeight = 23;
// X counts these code points once; every other (CJK, emoji) twice.
const xLightRanges: readonly (readonly [number, number])[] = [
  [0, 4351],
  [8192, 8205],
  [8208, 8223],
  [8242, 8247],
];
const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
const pictographic = /\p{Extended_Pictographic}/u;

function xWeight(text: string): number {
  let total = 0;
  for (const { segment } of segmenter.segment(text)) {
    if (pictographic.test(segment)) {
      total += 2;
      continue;
    }
    for (const char of segment) {
      const code = char.codePointAt(0) ?? 0;
      total += xLightRanges.some(([low, high]) => code >= low && code <= high) ? 1 : 2;
    }
  }
  return total;
}

export function countFor(text: string, unit: PlatformLimits["unit"]): number {
  switch (unit) {
    case "weighted": {
      const links = text.match(urlPattern) ?? [];
      return xWeight(text.replace(urlPattern, "")) + links.length * xUrlWeight;
    }
    case "graphemes":
      return [...segmenter.segment(text)].length;
    case "characters":
      return text.length;
  }
}

export interface FittedText {
  readonly text: string;
  readonly used: number;
  // The plain sentence saying what was cut; absent when everything fit.
  readonly notice?: string | undefined;
}

// The body, then the link and hashtags, each part on its own paragraph. A body too long is cut
// at the last sentence that still fits, else at the last word with "…"; the link and hashtags
// are never cut, but dropped (hashtags first) when even they don't fit.
export function fitText(
  input: {
    readonly body: string;
    readonly link: string | null;
    readonly hashtags: readonly string[];
  },
  limits: Pick<PlatformLimits, "text" | "unit">,
  siteName: string,
): FittedText {
  const body = input.body.trim();
  const tagLine = input.hashtags.join(" ");
  const join = (parts: readonly string[]) => parts.filter((part) => part !== "").join("\n\n");
  const count = (text: string) => countFor(text, limits.unit);
  const whole = join([body, input.link ?? "", tagLine]);
  if (count(whole) <= limits.text) return { text: whole, used: count(whole) };

  for (const tail of [[input.link ?? "", tagLine], [input.link ?? ""], []]) {
    const tailText = join(tail);
    const room = limits.text - (tailText === "" ? 0 : count(`\n\n${tailText}`));
    if (room <= 0) continue;
    const cut = cutBody(body, room, count);
    if (cut === "" && body !== "") continue;
    const text = join([cut, ...tail]);
    const dropped =
      tail.length === 2
        ? ""
        : tail.length === 1
          ? " and its hashtags"
          : ", its hashtags and the link";
    return {
      text,
      used: count(text),
      notice: `The text was cut to fit ${siteName}'s ${String(limits.text)} characters${dropped}. Shorten it in the post's text box, or pick a shorter text source.`,
    };
  }
  const text = cutBody(body, limits.text, count);
  return {
    text,
    used: count(text),
    notice: `The text was cut to fit ${siteName}'s ${String(limits.text)} characters. Shorten it in the post's text box.`,
  };
}

function cutBody(body: string, room: number, count: (text: string) => number): string {
  if (count(body) <= room) return body;
  const sentences = body.match(/[^.!?\n]+(?:[.!?]+["')\]]*|\n+|$)/gu) ?? [body];
  let kept = "";
  for (const sentence of sentences) {
    const next = kept + sentence;
    if (count(next.trimEnd()) > room) break;
    kept = next;
  }
  if (kept.trim() !== "") return kept.trim();
  const words = body.split(/\s+/u);
  let line = "";
  for (const word of words) {
    const next = line === "" ? word : `${line} ${word}`;
    if (count(`${next}…`) > room) break;
    line = next;
  }
  return line === "" ? "" : `${line}…`;
}

// Hashtags for a post: the description's tags, then the shorts' hashtags, each written once as
// a #Word without spaces or punctuation, at most `count`.
export function hashtagsFor(sources: readonly (readonly string[])[], count: number): string[] {
  if (count <= 0) return [];
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const raw of sources.flat()) {
    const word = raw
      .replace(/^#+/u, "")
      .split(/[^\p{L}\p{N}_]+/u)
      .map((part, index) => (index === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1)))
      .join("");
    if (word === "" || /^\d+$/u.test(word)) continue;
    const key = word.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(`#${word}`);
    if (tags.length >= count) break;
  }
  return tags;
}

// The YouTube description without what only YouTube uses: its chapter lines and their heading,
// and the hashtag lines at the end (the post gets its own).
export function stripChapters(description: string): string {
  const lines = description.replace(/\r\n?/gu, "\n").split("\n");
  const isChapter = (line: string) => {
    const match = /^(\S+)\s+\S/u.exec(line.trim());
    return match !== null && parseTimestamp(match[1] ?? "") !== undefined;
  };
  const kept = lines.filter((line, index) => {
    if (isChapter(line)) return false;
    const heading = /^(?:chapters|timestamps|contents)\s*:?\s*$/iu.test(line.trim());
    return !(heading && isChapter(lines[index + 1] ?? ""));
  });
  const trailing = (line: string) =>
    line.trim() === "" || /^(?:\s*#[\p{L}\p{N}_]+\s*)+$/u.test(line);
  while (kept.length > 0 && trailing(kept.at(-1) ?? "")) kept.pop();
  return kept
    .join("\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
}
