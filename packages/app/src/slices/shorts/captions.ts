import type { TimedWord } from "../../kernel/ports/subtitles.js";

// The shorts' captions: big, centred a little below the middle of the 9:16 frame, two to
// four words on screen at a time, and the word being spoken drawn in a strong colour. Built
// as ASS so the render burns them in with the same `ass` filter and font folder the video's
// captions use. Pure.

// Groups break at a sentence end, after a comma once they hold two words, at a pause, and
// at four words.
const groupMost = 4;
const groupPause = 0.6;
// A word left alone joins a neighbour across a pause up to this long; across a longer one
// the neighbour would hang on screen through the silence.
const joinPause = 1.5;
// A group stays on screen this long after its last word, unless the next one starts first,
// so a short pause doesn't flash an empty frame.
const holdSeconds = 0.5;
// ceiling: 7.5% of the height is about 144 px on 1080×1920, which fits twelve characters of
// a typical sans-serif per line inside the side margins.
const fontShare = 0.075;
const lineCharacters = 12;
const sideMargin = 80;
// A little below the middle: clear of the face-height centre of most images, and clear of
// the title and buttons the apps draw along the bottom.
const heightShare = 0.62;
// ASS colours are &HAABBGGRR. White for the words around it, gold for the one being spoken.
const white = "&H00FFFFFF";
const spoken = "&H0000D4FF";
// ceiling: the title headline starts at 6% of the height (115 px) and shrinks to 3.5% until
// it fits two lines. Barlow Bold averages about a third of its size per letter; 0.45 leaves
// room for wider fonts a project may caption in.
const titleShares = [0.06, 0.055, 0.05, 0.045, 0.04, 0.035];
const letterWidth = 0.45;
// Below the status bar, search and camera buttons the apps draw along the top: 11% of the
// height is 211 px on 1920.
const titleTop = 0.11;

export interface ShortCaptionStyle {
  readonly width: number;
  readonly height: number;
  readonly fontName: string;
  // False draws each group whole with no word lit, for word times that are only estimates.
  readonly wordByWord?: boolean | undefined;
  // The short's title, drawn as a headline near the top from the first frame to the last.
  readonly title?: { readonly text: string; readonly seconds: number } | undefined;
}

// The word times of a clip played `speed` times faster: every time divided, so the captions
// stay on the words as they are heard.
export function fasterWords(words: readonly TimedWord[], speed: number): readonly TimedWord[] {
  if (speed === 1) return words;
  return words.map((word) => ({
    ...word,
    start: millis(word.start / speed),
    end: millis(word.end / speed),
  }));
}

// The words said inside the clip, with their times moved to the clip's own timeline and
// clamped to it. A word is kept when most of it falls inside the clip.
export function clipWords(
  words: readonly TimedWord[],
  start: number,
  end: number,
): readonly TimedWord[] {
  const length = end - start;
  return words
    .filter((word) => (word.start + word.end) / 2 >= start && (word.start + word.end) / 2 <= end)
    .map((word) => ({
      text: word.text.replace(/\s+/g, " ").trim(),
      start: millis(clamp(word.start - start, 0, length)),
      end: millis(clamp(word.end - start, 0, length)),
    }))
    .filter((word) => word.text !== "" && word.end > word.start);
}

export function captionGroups(words: readonly TimedWord[]): readonly (readonly TimedWord[])[] {
  const groups: TimedWord[][] = [];
  let current: TimedWord[] = [];
  const close = (): void => {
    if (current.length > 0) groups.push(current);
    current = [];
  };
  for (const word of words) {
    const previous = current.at(-1);
    if (previous !== undefined && word.start - previous.end > groupPause) close();
    current.push(word);
    if (
      current.length >= groupMost ||
      sentenceEnd(word.text) ||
      (current.length >= 2 && /[,;:]["'’”)]*$/.test(word.text))
    )
      close();
  }
  close();
  // Every change leaves one word fewer on its own, so this ends.
  let changed = true;
  while (changed) {
    changed = groups.some((group, at) => group.length === 1 && keepCompany(groups, at));
    for (let at = groups.length - 1; at >= 0; at--)
      if (groups[at]?.length === 0) groups.splice(at, 1);
  }
  return groups;
}

// A word left on its own would flash by alone, so it joins a neighbouring group: the one
// before it, or, when it opens a sentence, the one after it first. When the neighbour is
// too wide to take it, the neighbour's nearest word comes over to make a pair instead,
// as long as that leaves the neighbour two words. It stays alone only after a long
// silence, or between neighbours of one or two words that cannot fit it. Returns whether
// the groups changed.
function keepCompany(groups: TimedWord[][], at: number): boolean {
  const lone = groups[at];
  const word = lone?.[0];
  if (lone === undefined || word === undefined) return false;
  const before = groups[at - 1];
  const after = groups[at + 1];
  const opensSentence = before?.at(-1) !== undefined && sentenceEnd(before.at(-1)?.text ?? "");
  // Words either side of a long silence stay apart: joined, one would sit on screen through it.
  const near = (left: TimedWord | undefined, right: TimedWord | undefined): boolean =>
    left !== undefined && right !== undefined && right.start - left.end <= joinPause;
  const tries: (() => boolean)[] = [
    () => {
      if (before === undefined || !near(before.at(-1), word)) return false;
      if (!fits([...before, word], before)) return false;
      before.push(word);
      lone.length = 0;
      return true;
    },
    () => {
      if (after === undefined || !near(word, after[0])) return false;
      if (!fits([word, ...after], after)) return false;
      after.unshift(word);
      lone.length = 0;
      return true;
    },
    () => {
      const moved = before?.at(-1);
      if (before === undefined || before.length < 3 || !near(moved, word)) return false;
      before.pop();
      if (moved !== undefined) lone.unshift(moved);
      return true;
    },
    () => {
      const moved = after?.[0];
      if (after === undefined || after.length < 3 || !near(word, moved)) return false;
      after.shift();
      if (moved !== undefined) lone.push(moved);
      return true;
    },
  ];
  const order = opensSentence ? [1, 3, 0, 2] : [0, 2, 1, 3];
  return order.some((index) => tries[index]?.() === true);
}

// A group with one more word fits when it holds at most one word over the usual most and
// its longest line is no wider than a line holds, or than the group's own longest already
// was.
function fits(merged: readonly TimedWord[], group: readonly TimedWord[]): boolean {
  const widest = (words: readonly TimedWord[]): number => longestLine(words.map((one) => one.text));
  return (
    merged.length <= groupMost + 1 && widest(merged) <= Math.max(lineCharacters, widest(group))
  );
}

function sentenceEnd(text: string): boolean {
  return /[.!?]["'’”)]*$/.test(text);
}

export function shortCaptionsAss(words: readonly TimedWord[], style: ShortCaptionStyle): string {
  const name = style.fontName.replace(/[\p{Cc},]/gu, " ").trim();
  const size = Math.round(style.height * fontShare);
  const position = `{\\an5\\pos(${String(style.width / 2)},${String(Math.round(style.height * heightShare))})}`;
  const title =
    style.title === undefined || style.title.text.trim() === ""
      ? undefined
      : { ...titleLayout(style.title.text, style), seconds: style.title.seconds };
  const header = `[Script Info]\nScriptType: v4.00+\nPlayResX: ${String(style.width)}\nPlayResY: ${String(style.height)}\nWrapStyle: 2\nScaledBorderAndShadow: yes\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Short,${name},${String(size)},${white},${white},&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,7,3,5,${String(sideMargin)},${String(sideMargin)},0,1\n${title === undefined ? "" : `Style: Title,${name},${String(title.size)},${white},${white},&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,6,3,8,${String(sideMargin)},${String(sideMargin)},0,1\n`}\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n`;
  const groups = captionGroups(words);
  // The headline sits on a layer of its own, so a caption never hides it.
  const events: string[] =
    title === undefined
      ? []
      : [
          `Dialogue: 1,${assStamp(0)},${assStamp(title.seconds)},Title,,0,0,0,,{\\an8\\pos(${String(style.width / 2)},${String(Math.round(style.height * titleTop))})}${title.lines.map(assText).join("\\N")}\n`,
        ];
  for (const [at, group] of groups.entries()) {
    const next = groups[at + 1]?.[0];
    const last = group.at(-1);
    if (last === undefined) continue;
    const shown =
      next === undefined ? last.end + holdSeconds : Math.min(last.end + holdSeconds, next.start);
    const lines = lineBreaks(group.map((word) => word.text));
    if (style.wordByWord === false) {
      const text = group
        .map(
          (one, place) =>
            `${assText(one.text)}${lines.has(place) ? "\\N" : place < group.length - 1 ? " " : ""}`,
        )
        .join("");
      const from = group[0]?.start ?? last.start;
      if (shown > from)
        events.push(
          `Dialogue: 0,${assStamp(from)},${assStamp(shown)},Short,,0,0,0,,${position}${text}\n`,
        );
      continue;
    }
    for (const [index, word] of group.entries()) {
      const from = word.start;
      const to = group[index + 1]?.start ?? Math.max(shown, word.end);
      if (to <= from) continue;
      const text = group
        .map((one, place) => {
          const escaped = assText(one.text);
          const shownWord =
            place === index
              ? `{\\c${spoken}&\\fscx108\\fscy108}${escaped}{\\c${white}&\\fscx100\\fscy100}`
              : escaped;
          return `${shownWord}${lines.has(place) ? "\\N" : place < group.length - 1 ? " " : ""}`;
        })
        .join("");
      events.push(
        `Dialogue: 0,${assStamp(from)},${assStamp(to)},Short,,0,0,0,,${position}${text}\n`,
      );
    }
  }
  return header + events.join("");
}

// The places after which a group breaks onto a second line: none when it fits on one,
// otherwise the one break that makes the longer line shortest.
function lineBreaks(texts: readonly string[], fit = lineCharacters): ReadonlySet<number> {
  const total = texts.join(" ").length;
  if (total <= fit || texts.length < 2) return new Set();
  let best = 0;
  let bestLongest = Number.POSITIVE_INFINITY;
  for (let after = 0; after < texts.length - 1; after++) {
    const top = texts.slice(0, after + 1).join(" ").length;
    const bottom = texts.slice(after + 1).join(" ").length;
    const longest = Math.max(top, bottom);
    if (longest < bestLongest) {
      bestLongest = longest;
      best = after;
    }
  }
  return new Set([best]);
}

// The characters of the longest line the words are drawn on.
function longestLine(texts: readonly string[]): number {
  return Math.max(...splitAt(texts, lineBreaks(texts)).map((line) => line.length));
}

// The title headline: the largest size at which it fits two lines inside the side margins,
// broken where the longer line is shortest; at the smallest size a title still too long is
// cut at a word and ends in an ellipsis.
export function titleLayout(
  title: string,
  style: Pick<ShortCaptionStyle, "width" | "height">,
): { readonly size: number; readonly lines: readonly string[] } {
  const words = title
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter((word) => word !== "");
  const room = (share: number): number =>
    Math.floor((style.width - 2 * sideMargin) / (style.height * share * letterWidth));
  const laid = (share: number, texts: readonly string[]) => {
    const fit = room(share);
    const breaks = lineBreaks(texts, fit);
    const lines = breaks.size === 0 ? [texts.join(" ")] : splitAt(texts, breaks);
    return { size: Math.round(style.height * share), lines, fit };
  };
  for (const share of titleShares) {
    const layout = laid(share, words);
    if (layout.lines.every((line) => line.length <= layout.fit))
      return { size: layout.size, lines: layout.lines };
  }
  const smallest = titleShares.at(-1) ?? 0.03;
  const fit = room(smallest);
  const kept: string[] = [];
  for (const word of words) {
    if ([...kept, word].join(" ").length + 1 > fit * 2 - 1) break;
    kept.push(word);
  }
  const layout = laid(smallest, [...kept.slice(0, -1), `${kept.at(-1) ?? ""}…`]);
  return { size: layout.size, lines: layout.lines };
}

function splitAt(texts: readonly string[], breaks: ReadonlySet<number>): readonly string[] {
  const lines: string[][] = [[]];
  for (const [at, text] of texts.entries()) {
    lines.at(-1)?.push(text);
    if (breaks.has(at)) lines.push([]);
  }
  return lines.map((line) => line.join(" "));
}

function assText(text: string): string {
  // Full-width alternatives stay visible and cannot open an ASS override or escape.
  return text.replaceAll("\\", "＼").replaceAll("{", "｛").replaceAll("}", "｝");
}

function assStamp(seconds: number): string {
  const cs = Math.max(0, Math.round(seconds * 100));
  return `${String(Math.floor(cs / 360_000))}:${String(Math.floor(cs / 6000) % 60).padStart(2, "0")}:${String(Math.floor(cs / 100) % 60).padStart(2, "0")}.${String(cs % 100).padStart(2, "0")}`;
}

function millis(seconds: number): number {
  return Math.round(seconds * 1000) / 1000;
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}
