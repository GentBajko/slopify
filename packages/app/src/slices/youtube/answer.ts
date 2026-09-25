import { z } from "zod";
import type { Message } from "../../kernel/ports/llm.js";
import {
  descriptionMaxCharacters,
  hashtagsMax,
  minChapterSeconds,
  minChapters,
  tagMaxCharacters,
  tagsMaxCharacters,
} from "./model.js";
import { parseTimestamp, youtubeTimestamp } from "./timestamps.js";

// The model answers in JSON and Slopify writes the description itself, so the layout YouTube
// needs (summary, blank line, one chapter per line, blank line, hashtags last) never depends
// on the model getting whitespace right. Pure: what was sent is rebuilt from saved inputs.

export interface DescriptionBrief {
  // The Description prompt with this run's keyword values substituted in, or the built-in one.
  readonly instruction: string;
  readonly title: string;
  readonly durationSeconds: number;
  // `transcriptText`: one timed passage per line.
  readonly transcript: string;
}

export interface Chapter {
  readonly start: number;
  readonly title: string;
}

export interface DescriptionAnswer {
  readonly summary: string;
  readonly chapters: readonly Chapter[];
  readonly hashtags: readonly string[];
  readonly tags: readonly string[];
}

export function descriptionMessages(brief: DescriptionBrief): readonly Message[] {
  const end = youtubeTimestamp(brief.durationSeconds);
  return [
    {
      role: "system",
      content: [
        "You write YouTube descriptions. Answer with one JSON object and nothing else, in this shape:",
        '{"summary": "...", "chapters": [{"start": "0:00", "title": "..."}], "hashtags": ["#Example"], "tags": ["example tag"]}',
        "",
        "Rules YouTube enforces, which the answer must follow:",
        '- The first chapter starts at exactly "0:00".',
        `- At least ${String(minChapters)} chapters, in order, each starting later than the one before.`,
        `- Every chapter lasts at least ${String(minChapterSeconds)} seconds, and every chapter starts before the video ends at ${end}.`,
        "- Write chapter times as M:SS, or H:MM:SS from the first hour on, and take them from the transcript's times.",
        "- A chapter title is one line and does not start with a time.",
        `- Hashtags are single words starting with #, at most ${String(hashtagsMax)}.`,
        `- Tags are plain search terms without # or commas, each at most ${String(tagMaxCharacters)} characters, no tag repeated, and all tags together at most ${String(tagsMaxCharacters)} characters.`,
        "- No < or > anywhere.",
        "- The summary is plain text without chapters, hashtags or links.",
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        brief.instruction,
        "",
        `Video title: ${brief.title}`,
        `Video length: ${end}`,
        "",
        "Transcript, each passage led by the time it starts in the video:",
        "",
        brief.transcript,
      ].join("\n"),
    },
  ];
}

const answerSchema = z.object({
  summary: z.string(),
  chapters: z.array(z.object({ start: z.union([z.string(), z.number()]), title: z.string() })),
  hashtags: z.array(z.string()),
  tags: z.array(z.string()),
});

export type CheckedAnswer =
  | { readonly ok: true; readonly value: DescriptionAnswer }
  | { readonly ok: false; readonly reason: string };

const fix = "Retry stage, or choose another model in Edit project → Providers.";

// Reads and checks the model's answer. The reason is the sentence the stage shows; the
// provider wrapper's `check` asks the model again while attempts remain.
export function checkDescriptionAnswer(text: string, durationSeconds: number): CheckedAnswer {
  const parsed = answerSchema.safeParse(jsonOf(text));
  if (!parsed.success)
    return {
      ok: false,
      reason: `The AI model's YouTube description didn't come back in the expected format (a JSON object with a summary, chapters, hashtags and tags). ${fix}`,
    };
  const summary = parsed.data.summary.trim();
  if (summary === "")
    return { ok: false, reason: `The AI model's YouTube description has no summary. ${fix}` };
  const chapters = checkChapters(parsed.data.chapters, durationSeconds);
  if (!chapters.ok) return chapters;
  const hashtags = checkHashtags(parsed.data.hashtags);
  if (!hashtags.ok) return hashtags;
  const tags = checkTags(parsed.data.tags);
  if (!tags.ok) return tags;
  const value = { summary, chapters: chapters.value, hashtags: hashtags.value, tags: tags.value };
  const description = assembleDescription(value);
  if (/[<>]/.test(description))
    return {
      ok: false,
      reason: `The AI model's YouTube description contains < or >, which YouTube doesn't allow. ${fix}`,
    };
  if (description.length > descriptionMaxCharacters)
    return {
      ok: false,
      reason: `The AI model's YouTube description is ${String(description.length)} characters, over YouTube's ${String(descriptionMaxCharacters)}. ${fix}`,
    };
  return { ok: true, value };
}

// Summary, a blank line, one "M:SS Title" per chapter, a blank line, then the hashtags,
// which YouTube shows above the title when they come last.
export function assembleDescription(answer: DescriptionAnswer): string {
  return [
    answer.summary,
    "",
    ...answer.chapters.map((chapter) => `${youtubeTimestamp(chapter.start)} ${chapter.title}`),
    "",
    answer.hashtags.join(" "),
  ].join("\n");
}

// What goes in YouTube's Tags field: comma-separated.
export function tagsText(tags: readonly string[]): string {
  return tags.join(", ");
}

// YouTube counts the Tags field as typed: the commas between tags, and the quotes it adds
// around a tag with a space in it.
export function tagsLength(tags: readonly string[]): number {
  return (
    tags.reduce((sum, tag) => sum + tag.length + (/\s/.test(tag) ? 2 : 0), 0) +
    Math.max(0, tags.length - 1)
  );
}

function checkChapters(
  raw: readonly { readonly start: string | number; readonly title: string }[],
  durationSeconds: number,
): { readonly ok: true; readonly value: readonly Chapter[] } | { ok: false; reason: string } {
  const broke = (rule: string) => ({
    ok: false as const,
    reason: `The AI model's chapters broke YouTube's rules (${rule}). ${fix}`,
  });
  if (raw.length < minChapters)
    return broke(
      `there must be at least ${String(minChapters)} chapters, and it wrote ${String(raw.length)}`,
    );
  const chapters: Chapter[] = [];
  for (const [index, row] of raw.entries()) {
    const start =
      typeof row.start === "number"
        ? Number.isInteger(row.start) && row.start >= 0
          ? row.start
          : undefined
        : parseTimestamp(row.start);
    if (start === undefined)
      return broke(
        `chapter ${String(index + 1)} starts at "${String(row.start)}", not a time like 2:15`,
      );
    const title = row.title.trim();
    if (
      title === "" ||
      /[\r\n]/.test(title) ||
      parseTimestamp(title.split(/\s/)[0] ?? "") !== undefined
    )
      return broke(
        `chapter ${String(index + 1)} needs a one-line title that doesn't start with a time`,
      );
    chapters.push({ start, title });
  }
  if (chapters[0]?.start !== 0) return broke("the first chapter must start at 0:00");
  for (const [index, chapter] of chapters.entries()) {
    const previous = chapters[index - 1];
    if (previous !== undefined && chapter.start <= previous.start)
      return broke(
        `chapter ${String(index + 1)} at ${youtubeTimestamp(chapter.start)} must start after chapter ${String(index)} at ${youtubeTimestamp(previous.start)}`,
      );
    if (chapter.start >= durationSeconds)
      return broke(
        `chapter ${String(index + 1)} starts at ${youtubeTimestamp(chapter.start)}, after the video ends at ${youtubeTimestamp(durationSeconds)}`,
      );
  }
  for (const [index, chapter] of chapters.entries()) {
    const end = chapters[index + 1]?.start ?? durationSeconds;
    if (end - chapter.start < minChapterSeconds)
      return broke(
        `chapter ${String(index + 1)} "${chapter.title}" lasts ${String(Math.floor(end - chapter.start))} seconds, and each must last at least ${String(minChapterSeconds)}`,
      );
  }
  return { ok: true, value: chapters };
}

function checkHashtags(
  raw: readonly string[],
): { readonly ok: true; readonly value: readonly string[] } | { ok: false; reason: string } {
  const broke = (rule: string) => ({
    ok: false as const,
    reason: `The AI model's hashtags broke YouTube's rules (${rule}). ${fix}`,
  });
  const hashtags = raw
    .map((tag) => tag.trim())
    .filter((tag) => tag !== "")
    .map((tag) => (tag.startsWith("#") ? tag : `#${tag}`));
  if (hashtags.length === 0) return broke("there must be at least one hashtag");
  if (hashtags.length > hashtagsMax)
    return broke(
      `YouTube ignores them all past ${String(hashtagsMax)}, and it wrote ${String(hashtags.length)}`,
    );
  const bad = hashtags.find((tag) => !/^#[\p{L}\p{N}_]+$/u.test(tag));
  if (bad !== undefined) return broke(`"${bad}" is not one word after the #`);
  return { ok: true, value: hashtags };
}

function checkTags(
  raw: readonly string[],
): { readonly ok: true; readonly value: readonly string[] } | { ok: false; reason: string } {
  const broke = (rule: string) => ({
    ok: false as const,
    reason: `The AI model's tags broke YouTube's rules (${rule}). ${fix}`,
  });
  const tags = raw.map((tag) => tag.trim().replace(/\s+/g, " ")).filter((tag) => tag !== "");
  if (tags.length === 0) return broke("there must be at least one tag");
  const long = tags.find((tag) => tag.length > tagMaxCharacters);
  if (long !== undefined)
    return broke(`"${long.slice(0, 40)}…" is over ${String(tagMaxCharacters)} characters`);
  const odd = tags.find((tag) => /[,<>]/.test(tag));
  if (odd !== undefined) return broke(`"${odd}" contains a comma, < or >`);
  const seen = new Set<string>();
  for (const tag of tags) {
    const key = tag.toLowerCase();
    if (seen.has(key)) return broke(`"${tag}" is listed twice`);
    seen.add(key);
  }
  const length = tagsLength(tags);
  if (length > tagsMaxCharacters)
    return broke(
      `the tags come to ${String(length)} characters, over YouTube's ${String(tagsMaxCharacters)}`,
    );
  return { ok: true, value: tags };
}

// The object in the answer, wherever the model put it: bare, in a ```json fence, or after a
// sentence of its own.
function jsonOf(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return undefined;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return undefined;
  }
}
