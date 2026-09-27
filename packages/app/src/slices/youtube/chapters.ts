// Chapters as YouTube takes them. YouTube turns the timestamps of a description into chapters
// only when the first is at 0:00, there are at least three, each lasts at least ten seconds and
// they go up in time; otherwise it ignores the whole list. The step's answer is checked against
// those rules when it is written (`answer.ts`), but a hand edit, or a video cut again to another
// length after the description was written, can break them. So the chapters are fitted when the
// description is shown or copied, never stored: the generated file, the user's edit and every
// fingerprint stay as they were, and the page says what was changed. Pure and browser-safe.

import { minChapterSeconds, minChapters } from "./model.js";
import { parseTimestamp, youtubeTimestamp } from "./timestamps.js";

export interface ChapterFit {
  // The chapters text to show and copy: the input itself when nothing needed fixing.
  readonly text: string;
  // What was changed, as short clauses for `chapterNotice`; empty when nothing was.
  readonly adjustments: readonly string[];
}

interface Line {
  readonly start: number;
  readonly title: string;
}

// "M:SS Title": a time YouTube reads, then a title.
function chapterLine(line: string): Line | undefined {
  const trimmed = line.trim();
  const match = /^(\S+)\s+(.+)$/u.exec(trimmed);
  if (match === null) return undefined;
  const start = parseTimestamp(match[1] ?? "");
  const title = (match[2] ?? "").trim();
  return start === undefined || title === "" ? undefined : { start, title };
}

// Fits one chapters field (one "M:SS Title" per line) to YouTube's rules, in this order:
// 1. chapters out of time order are put in order, and of two at the same time the one listed
//    first stays;
// 2. with the video's length known, a chapter starting at or after its end is removed;
// 3. the first chapter moves to 0:00;
// 4. the first chapter shorter than ten seconds is merged into its neighbour, again until none
//    is: into the one before it (whose title stays), or, for the first chapter, into the one
//    after it, which then starts at 0:00. The last chapter's length is only known with the
//    video's length;
// 5. with fewer than three chapters left, the list is dropped, since YouTube would ignore it.
// Other lines in the field (a note the user typed) stay where they were. When anything changed,
// the chapter lines are rewritten in YouTube's M:SS form.
export function fitChapters(text: string, durationSeconds?: number): ChapterFit {
  const lines = text.replace(/\r\n?/gu, "\n").split("\n");
  const slots: number[] = [];
  const found: Line[] = [];
  for (const [index, line] of lines.entries()) {
    const chapter = chapterLine(line);
    if (chapter === undefined) continue;
    slots.push(index);
    found.push(chapter);
  }
  if (found.length === 0) return { text, adjustments: [] };
  const adjustments: string[] = [];
  const quoted = (chapter: Line) => `"${chapter.title}"`;

  let chapters = [...found].sort((a, b) => a.start - b.start);
  if (chapters.some((chapter, index) => chapter !== found[index]))
    adjustments.push("put the chapters in time order");
  // Two chapters at the same time: the one listed first keeps it.
  const distinct: Line[] = [];
  for (const chapter of chapters) {
    const previous = distinct.at(-1);
    if (previous !== undefined && previous.start === chapter.start)
      adjustments.push(`merged ${quoted(chapter)} (0 s) into ${quoted(previous)}`);
    else distinct.push(chapter);
  }
  chapters = distinct;

  const end =
    durationSeconds !== undefined && Number.isFinite(durationSeconds) && durationSeconds > 0
      ? durationSeconds
      : undefined;
  if (end !== undefined) {
    const after = chapters.filter((chapter, index) => index > 0 && chapter.start >= end);
    for (const chapter of after)
      adjustments.push(
        `removed ${quoted(chapter)} (${youtubeTimestamp(chapter.start)}), which starts after the video ends at ${youtubeTimestamp(end)}`,
      );
    chapters = chapters.filter((chapter) => !after.includes(chapter));
  }

  const first = chapters[0];
  if (first !== undefined && first.start !== 0) {
    adjustments.push(
      `moved the first, ${quoted(first)}, from ${youtubeTimestamp(first.start)} to 0:00`,
    );
    chapters = [{ start: 0, title: first.title }, ...chapters.slice(1)];
  }

  const length = (index: number): number => {
    const next = chapters[index + 1];
    const start = chapters[index]?.start ?? 0;
    if (next !== undefined) return next.start - start;
    return end === undefined ? Number.POSITIVE_INFINITY : end - start;
  };
  const seconds = (value: number) => `${String(Math.max(0, Math.floor(value)))} s`;
  while (chapters.length > 1) {
    const short = chapters.findIndex((_, index) => length(index) < minChapterSeconds);
    if (short === -1) break;
    const chapter = chapters[short];
    if (chapter === undefined) break;
    const lasted = seconds(length(short));
    if (short === 0) {
      const next = chapters[1];
      if (next === undefined) break;
      adjustments.push(`merged ${quoted(chapter)} (${lasted}) into ${quoted(next)}`);
      chapters = [{ start: 0, title: next.title }, ...chapters.slice(2)];
    } else {
      const previous = chapters[short - 1];
      if (previous === undefined) break;
      adjustments.push(`merged ${quoted(chapter)} (${lasted}) into ${quoted(previous)}`);
      chapters = chapters.filter((_, index) => index !== short);
    }
  }

  if (chapters.length < minChapters) {
    adjustments.push(
      `left the chapter list out, since YouTube needs at least ${String(minChapters)} chapters of ${String(minChapterSeconds)} s or more and only ${String(chapters.length)} ${chapters.length === 1 ? "is" : "are"} left`,
    );
    chapters = [];
  }

  if (adjustments.length === 0) return { text, adjustments };
  // The chapters go back into the first slots in order; the slots left over are removed.
  const bySlot = new Map(slots.map((slot, index) => [slot, chapters[index]]));
  const rewritten = lines.flatMap((line, index) => {
    if (!bySlot.has(index)) return [line];
    const chapter = bySlot.get(index);
    return chapter === undefined ? [] : [`${youtubeTimestamp(chapter.start)} ${chapter.title}`];
  });
  return { text: rewritten.join("\n").trim(), adjustments };
}

// The sentence shown beside the description; undefined when nothing was changed.
export function chapterNotice(adjustments: readonly string[]): string | undefined {
  return adjustments.length === 0
    ? undefined
    : `Chapters adjusted for YouTube: ${adjustments.join("; ")}.`;
}
