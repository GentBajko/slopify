import type { Message } from "../kernel/ports/llm.js";
import { type SampleStyle, sampleDelivery, styled } from "./content.js";

// The sample's "text model": fixed, hand-written answers to what the pipeline asks it - each
// paragraph's delivery cues, the YouTube description, which moments make the shorts, and each
// short's image prompts - worked out from what the pipeline sends, so the times are real.

const chapters: readonly { readonly opens: string; readonly title: string }[] = [
  { opens: "Around three hundred years", title: "A Library at the Edge of the Sea" },
  { opens: "Nobody knows how many", title: "Collecting Everything" },
  { opens: "The famous picture", title: "How It Disappeared" },
  { opens: "The library did not vanish", title: "What It Left Behind" },
];

const shorts: readonly {
  readonly opens: string;
  readonly title: string;
  readonly description: string;
  readonly hashtags: readonly string[];
  readonly scenes: readonly string[];
}[] = [
  {
    opens: "What is clear is the ambition",
    title: "The library that copied every ship's books",
    description: "How Alexandria gathered books, paid scholars and measured the Earth.",
    hashtags: ["#history", "#science", "#alexandria"],
    scenes: [
      "shelves of rolled scrolls in lamplit niches, warm light",
      "the harbor at dusk with a lighthouse, the sun on the water",
      "scrolls stacked in niches, amber dust in the air",
    ],
  },
  {
    opens: "The famous picture",
    title: "The library didn't burn in one night",
    description: "Why the story of a single great fire is almost certainly wrong.",
    hashtags: ["#history", "#myths", "#libraryofalexandria"],
    scenes: [
      "a ruined colonnade against an orange sky, embers drifting",
      "a broken column and embers, dark sky",
      "a tilted disc roof by the sea at night under stars",
    ],
  },
];

export function scriptedAnswer(messages: readonly Message[], style: SampleStyle): string {
  const system = messages.find((message) => message.role === "system")?.content ?? "";
  // The first ask carries the transcript; a retry only adds what was wrong.
  const user = messages.find((message) => message.role === "user")?.content ?? "";
  if (system.startsWith('Return JSON only: {"cues"')) return cues(user);
  if (system.startsWith("You write YouTube descriptions")) return description(user);
  if (system.startsWith("You pick clips")) return picks(user, system);
  if (system.startsWith("You write prompts for an image model"))
    return prompts(user, system, style);
  throw new Error(`The sample's text script has no answer for: ${system.slice(0, 80)}`);
}

// The preparation step's answer for one paragraph: the cues written for the paragraph whose
// sentences it is sent (`content.ts`).
function cues(user: string): string {
  const request = JSON.parse(user) as { sentences?: { text?: string }[] };
  const first = request.sentences?.[0]?.text?.trim() ?? "";
  const paragraph = sampleDelivery.find((one) => first.startsWith(one.opens));
  if (paragraph === undefined)
    throw new Error(`The sample has no delivery cues for "${first.slice(0, 60)}".`);
  return JSON.stringify({ cues: paragraph.cues });
}

function seconds(stamp: string): number {
  return stamp
    .split(":")
    .map(Number)
    .reduce((sum, part) => sum * 60 + part, 0);
}

function stamp(value: number): string {
  const whole = Math.floor(value);
  return `${String(Math.floor(whole / 60))}:${String(whole % 60).padStart(2, "0")}`;
}

function description(user: string): string {
  const passages = [...user.matchAll(/^\[(\d+:\d{2})\] (.*)$/gm)].map((match) => ({
    start: seconds(match[1] ?? "0:00"),
    text: match[2] ?? "",
  }));
  const length = seconds(/^Video length: (.*)$/m.exec(user)?.[1] ?? "0:00");
  const exact = chapters.map((chapter, index) => ({
    start:
      index === 0
        ? 0
        : (passages.find((passage) => passage.text.includes(chapter.opens))?.start ??
          (length * index) / chapters.length),
    title: chapter.title,
  }));
  return JSON.stringify({
    summary:
      "The Library of Alexandria set out to hold all the world's knowledge. Here is what it really was, who worked there, why the story of one great fire is a myth, and what it left behind.",
    chapters: exact.map((chapter) => ({ start: stamp(chapter.start), title: chapter.title })),
    hashtags: ["#history", "#ancientegypt", "#libraryofalexandria"],
    tags: [
      "library of alexandria",
      "ancient alexandria",
      "ptolemaic egypt",
      "mouseion",
      "eratosthenes",
      "callimachus pinakes",
      "burning of the library of alexandria",
      "bibliotheca alexandrina",
      "ancient history",
      "history documentary",
      "lost knowledge",
      "ancient libraries",
    ],
  });
}

function picks(user: string, system: string): string {
  const sentences = [...user.matchAll(/^\[(\d+)\] \((\d+:\d{2})-(\d+:\d{2})\) (.*)$/gm)].map(
    (match) => ({
      number: Number(match[1]),
      start: seconds(match[2] ?? "0:00"),
      end: seconds(match[3] ?? "0:00"),
      text: match[4] ?? "",
    }),
  );
  const limits = /between (\d+) and (\d+) seconds/.exec(system);
  const min = Number(limits?.[1] ?? 30);
  const max = Number(limits?.[2] ?? 60);
  const opening = shorts.map((short) =>
    sentences.find((sentence) => sentence.text.includes(short.opens)),
  );
  return JSON.stringify(
    shorts.map((short, index) => {
      const first = opening[index];
      const stop = opening[index + 1]?.number ?? Number.POSITIVE_INFINITY;
      if (first === undefined) throw new Error(`No sentence opens with "${short.opens}".`);
      let last = first;
      for (const sentence of sentences.filter(
        (one) => one.number > first.number && one.number < stop,
      )) {
        if (sentence.end - first.start > max) break;
        last = sentence;
        if (sentence.end - first.start >= (min + max) / 2) break;
      }
      return {
        first: first.number,
        last: last.number,
        title: short.title,
        description: short.description,
        hashtags: short.hashtags,
        why: "It tells one complete surprise on its own.",
      };
    }),
  );
}

function prompts(user: string, system: string, style: SampleStyle): string {
  const count = Number(/Exactly (\d+) prompt/.exec(system)?.[1] ?? 1);
  const title = /^Short: (.*)$/m.exec(user)?.[1] ?? "";
  const short = shorts.find((one) => one.title === title) ?? shorts[0];
  const scenes = short?.scenes ?? [];
  return JSON.stringify(
    Array.from({ length: count }, (_value, at) =>
      styled(style, scenes[at % Math.max(1, scenes.length)] ?? "", true),
    ),
  );
}
