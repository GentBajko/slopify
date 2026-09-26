import type { TimedWord } from "../../kernel/ports/subtitles.js";

// The shorts' captions: big, centred a little below the middle of the 9:16 frame, two to
// four words on screen at a time, and the word being spoken drawn in a strong colour. Built
// as ASS so the render burns them in with the same `ass` filter and font folder the video's
// captions use. Pure.

// Groups break at a sentence end, after a comma once they hold two words, at a pause, and
// at four words.
const groupMost = 4;
const groupPause = 0.6;
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

export interface ShortCaptionStyle {
  readonly width: number;
  readonly height: number;
  readonly fontName: string;
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
      /[.!?]["'’”)]*$/.test(word.text) ||
      (current.length >= 2 && /[,;:]["'’”)]*$/.test(word.text))
    )
      close();
  }
  close();
  // A word left on its own joins the group before it when that one has room and nothing
  // closed it but a comma, so one word rarely flashes by itself.
  const merged: TimedWord[][] = [];
  for (const group of groups) {
    const before = merged.at(-1);
    const last = before?.at(-1);
    const first = group[0];
    if (
      group.length === 1 &&
      before !== undefined &&
      last !== undefined &&
      first !== undefined &&
      before.length < groupMost &&
      !/[.!?]["'’”)]*$/.test(last.text) &&
      first.start - last.end <= groupPause
    )
      before.push(first);
    else merged.push([...group]);
  }
  return merged;
}

export function shortCaptionsAss(words: readonly TimedWord[], style: ShortCaptionStyle): string {
  const name = style.fontName.replace(/[\p{Cc},]/gu, " ").trim();
  const size = Math.round(style.height * fontShare);
  const position = `{\\an5\\pos(${String(style.width / 2)},${String(Math.round(style.height * heightShare))})}`;
  const header = `[Script Info]\nScriptType: v4.00+\nPlayResX: ${String(style.width)}\nPlayResY: ${String(style.height)}\nWrapStyle: 2\nScaledBorderAndShadow: yes\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Short,${name},${String(size)},${white},${white},&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,7,3,5,${String(sideMargin)},${String(sideMargin)},0,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n`;
  const groups = captionGroups(words);
  const events: string[] = [];
  for (const [at, group] of groups.entries()) {
    const next = groups[at + 1]?.[0];
    const last = group.at(-1);
    if (last === undefined) continue;
    const shown =
      next === undefined ? last.end + holdSeconds : Math.min(last.end + holdSeconds, next.start);
    const lines = lineBreaks(group.map((word) => word.text));
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
function lineBreaks(texts: readonly string[]): ReadonlySet<number> {
  const total = texts.join(" ").length;
  if (total <= lineCharacters || texts.length < 2) return new Set();
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
