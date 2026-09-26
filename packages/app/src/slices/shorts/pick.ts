import { z } from "zod";
import type { Message } from "../../kernel/ports/llm.js";
import { youtubeTimestamp } from "../youtube/timestamps.js";
import type { TranscriptSentence } from "../youtube/transcript.js";
import { shortHashtagsMax, shortHashtagsMin, shortTitleMax } from "./model.js";

// The model picks clips by sentence number and Slopify turns the numbers into times, so a
// clip always starts and ends on a sentence edge the word timing measured. Pure: what was
// sent is rebuilt from saved inputs.

export interface PickBrief {
  // The Shorts prompt with this run's keyword values substituted in, or the built-in one.
  readonly instruction: string;
  readonly title: string;
  readonly durationSeconds: number;
  readonly count: number;
  readonly minSeconds: number;
  readonly maxSeconds: number;
  // `sentencesText`: one numbered, timed sentence per line.
  readonly sentences: string;
}

export interface ShortPick {
  // 1-based, in the order the clips play in the video.
  readonly number: number;
  // The sentence numbers the clip runs from and to, inclusive.
  readonly first: number;
  readonly last: number;
  // Seconds into the final video, on the same timeline as the word timing.
  readonly start: number;
  readonly end: number;
  readonly title: string;
  readonly description: string;
  readonly hashtags: readonly string[];
  readonly why: string;
  // What is said in the clip, which the image prompts are written from.
  readonly text: string;
}

export const shortPickSchema = z.object({
  number: z.number().int().positive(),
  first: z.number().int().positive(),
  last: z.number().int().positive(),
  start: z.number().finite().nonnegative(),
  end: z.number().finite().positive(),
  title: z.string(),
  description: z.string(),
  hashtags: z.array(z.string()),
  why: z.string(),
  text: z.string(),
});

export function pickMessages(brief: PickBrief): readonly Message[] {
  const plural = brief.count === 1 ? "short" : "shorts";
  return [
    {
      role: "system",
      content: [
        "You pick clips from a narrated video to publish as vertical shorts. Answer with one JSON array and nothing else, best clip first, in this shape:",
        '[{"first": 12, "last": 19, "title": "...", "description": "...", "hashtags": ["#Example"], "why": "..."}]',
        "",
        "Rules the answer must follow:",
        `- Exactly ${String(brief.count)} ${plural}, unless the video is too short to hold that many.`,
        '- "first" and "last" are sentence numbers from the transcript. A clip runs from the start of sentence "first" to the end of sentence "last", both included.',
        `- Each clip lasts between ${String(brief.minSeconds)} and ${String(brief.maxSeconds)} seconds, measured from the start time of its first sentence to the end time of its last one.`,
        "- No two clips share a sentence.",
        `- "title" is at most ${String(shortTitleMax)} characters, one line, without hashtags.`,
        '- "description" is one line.',
        `- "hashtags" holds ${String(shortHashtagsMin)} to ${String(shortHashtagsMax)} single words, each starting with #.`,
        '- "why" is one short sentence saying why the clip works on its own.',
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        brief.instruction,
        "",
        `Video title: ${brief.title}`,
        `Video length: ${youtubeTimestamp(brief.durationSeconds)}`,
        `Shorts wanted: ${String(brief.count)}, each ${String(brief.minSeconds)}-${String(brief.maxSeconds)} seconds long`,
        "",
        "Transcript, one sentence per line, each led by its number and the time it runs in the video:",
        "",
        brief.sentences,
      ].join("\n"),
    },
  ];
}

// The second and last ask: the first answer, and what was wrong with it, so the model can
// keep the clips that worked and replace the rest.
export function pickRetryMessages(
  brief: PickBrief,
  answer: string,
  problems: readonly string[],
): readonly Message[] {
  return [
    ...pickMessages(brief),
    { role: "assistant", content: answer },
    {
      role: "user",
      content: [
        "Some of those clips can't be used:",
        ...problems.map((problem) => `- ${problem}`),
        "",
        `Answer again with the whole list of ${String(brief.count)} clips as one JSON array, following every rule.`,
      ].join("\n"),
    },
  ];
}

const answerSchema = z.array(
  z.object({
    first: z.union([z.number(), z.string()]),
    last: z.union([z.number(), z.string()]),
    title: z.string(),
    description: z.string(),
    hashtags: z.array(z.string()),
    why: z.string().optional(),
  }),
);

export type CheckedPicks =
  | { readonly ok: false; readonly reason: string }
  | {
      readonly ok: true;
      readonly picks: readonly ShortPick[];
      // One sentence per clip that could not be used, addressed to the model.
      readonly problems: readonly string[];
    };

const fix = "Retry stage, or choose another model in Edit project → Providers.";

export interface PickLimits {
  readonly count: number;
  readonly minSeconds: number;
  readonly maxSeconds: number;
  readonly durationSeconds: number;
}

// ceiling: a clip opens a quarter second before its first word and closes 0.4 s after its
// last, so the first consonant and the last breath are kept; never past halfway to the
// neighbouring sentence, so a clip holds nothing of the words around it.
const leadSeconds = 0.25;
const tailSeconds = 0.4;
// Timing noise: the length rules are checked to the hundredth of a second.
const tolerance = 0.01;

// Reads the model's answer and keeps the clips that follow the rules: in range, the right
// length, not overlapping one already kept, best first until `count`, then in video order.
// Not being a JSON array of clips is the one failure; everything else is a problem to tell
// the model about.
export function checkPicks(
  text: string,
  sentences: readonly TranscriptSentence[],
  limits: PickLimits,
): CheckedPicks {
  const parsed = answerSchema.safeParse(jsonArrayOf(text));
  if (!parsed.success)
    return {
      ok: false,
      reason: `The AI model's choice of shorts didn't come back in the expected format (a JSON list of clips, each with first and last sentence numbers, a title, a description and hashtags). ${fix}`,
    };
  const problems: string[] = [];
  const kept: Omit<ShortPick, "number">[] = [];
  for (const [index, row] of parsed.data.entries()) {
    const label = `Clip ${String(index + 1)}`;
    if (kept.length >= limits.count) break;
    const first = Number(row.first);
    const last = Number(row.last);
    if (
      !Number.isInteger(first) ||
      !Number.isInteger(last) ||
      first < 1 ||
      last > sentences.length ||
      first > last
    ) {
      problems.push(
        `${label} runs from sentence ${String(row.first)} to ${String(row.last)}, but the transcript has sentences 1 to ${String(sentences.length)} and the first must not come after the last.`,
      );
      continue;
    }
    const opening = sentences[first - 1];
    const closing = sentences[last - 1];
    if (opening === undefined || closing === undefined) continue;
    const before = sentences[first - 2]?.end ?? 0;
    const after = sentences[last]?.start ?? limits.durationSeconds;
    const start = Math.max(
      0,
      opening.start - Math.max(0, Math.min(leadSeconds, (opening.start - before) / 2)),
    );
    const end = Math.min(
      limits.durationSeconds,
      closing.end + Math.max(0, Math.min(tailSeconds, (after - closing.end) / 2)),
    );
    const seconds = end - start;
    if (seconds < limits.minSeconds - tolerance || seconds > limits.maxSeconds + tolerance) {
      problems.push(
        `${label} (sentences ${String(first)}-${String(last)}) lasts ${String(Math.round(seconds))} seconds, and each clip must last ${String(limits.minSeconds)}-${String(limits.maxSeconds)} seconds.`,
      );
      continue;
    }
    const clash = kept.find((one) => first <= one.last && last >= one.first);
    if (clash !== undefined) {
      problems.push(
        `${label} (sentences ${String(first)}-${String(last)}) shares sentences with the clip of sentences ${String(clash.first)}-${String(clash.last)}.`,
      );
      continue;
    }
    const title = row.title.replace(/\s+/g, " ").trim();
    if (title === "" || title.length > shortTitleMax) {
      problems.push(
        title === ""
          ? `${label} has no title.`
          : `${label}'s title is ${String(title.length)} characters; keep it to ${String(shortTitleMax)}.`,
      );
      continue;
    }
    const description = row.description.replace(/\s+/g, " ").trim();
    if (description === "") {
      problems.push(`${label} has no description.`);
      continue;
    }
    const hashtags = [
      ...new Set(
        row.hashtags
          .map((tag) => tag.trim().replace(/^#*/, ""))
          .filter((tag) => /^[\p{L}\p{N}_]+$/u.test(tag))
          .map((tag) => `#${tag}`),
      ),
    ].slice(0, shortHashtagsMax);
    if (hashtags.length === 0) {
      problems.push(`${label} has no usable hashtags (single words starting with #).`);
      continue;
    }
    kept.push({
      first,
      last,
      start: round(start),
      end: round(end),
      title,
      description,
      hashtags,
      why: (row.why ?? "").replace(/\s+/g, " ").trim(),
      text: sentences
        .slice(first - 1, last)
        .map((sentence) => sentence.text)
        .join(" "),
    });
  }
  if (kept.length < limits.count && parsed.data.length < limits.count)
    problems.push(
      `The answer lists ${String(parsed.data.length)} ${parsed.data.length === 1 ? "clip" : "clips"}, and ${String(limits.count)} were asked for.`,
    );
  return {
    ok: true,
    picks: kept
      .toSorted((left, right) => left.start - right.start)
      .map((pick, index) => ({ number: index + 1, ...pick })),
    problems,
  };
}

// The sentence a failed pick ends on, when not even the second answer held a usable clip.
export function noPicksMessage(problems: readonly string[], limits: PickLimits): string {
  const shortVideo = limits.durationSeconds < limits.minSeconds;
  if (shortVideo)
    return `The narration is ${String(Math.round(limits.durationSeconds))} seconds long, shorter than the ${String(limits.minSeconds)}-second minimum for a short, so there is nothing to cut. Lower the shortest length in Edit project → Prompts → Shorts, then Retry stage.`;
  return `The AI model didn't pick any clip Slopify could use as a short, twice (${problems[0] ?? "no clips were listed"}). Retry stage; if it keeps happening, widen the length range in Edit project → Prompts → Shorts, or choose another model in Edit project → Providers.`;
}

function round(seconds: number): number {
  return Math.round(seconds * 1000) / 1000;
}

// The array in the answer, wherever the model put it: bare, in a ```json fence, or after a
// sentence of its own.
function jsonArrayOf(text: string): unknown {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end <= start) return undefined;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return undefined;
  }
}
