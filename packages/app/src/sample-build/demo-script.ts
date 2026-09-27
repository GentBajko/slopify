import type { Message } from "../kernel/ports/llm.js";
import { demoCuesFor } from "./demo-turns.js";
import { type Demo, demoPrompt } from "./demos.js";

// A demo's "text model": fixed answers to what the pipeline asks it - the audiobook's speaker
// split, each turn's delivery cues, the YouTube description, which moment makes the short and
// the short's image prompts - worked out from what the pipeline sends, so the times are real.

export function demoAnswer(demo: Demo, messages: readonly Message[], procedural: boolean): string {
  const system = messages.find((message) => message.role === "system")?.content ?? "";
  // The first ask carries the transcript; a retry only adds what was wrong.
  const user = messages.find((message) => message.role === "user")?.content ?? "";
  if (system.startsWith("You split a text into speaker turns")) {
    if (demo.attributed === undefined) throw new Error(`The ${demo.id} demo has no speaker split.`);
    return demo.attributed;
  }
  if (system.startsWith('Return JSON only: {"cues"')) return cues(demo, user);
  if (system.startsWith("You write YouTube descriptions")) return description(demo, user);
  if (system.startsWith("You pick clips")) return picks(demo, user, system);
  if (system.startsWith("You write prompts for an image model"))
    return prompts(demo, system, procedural);
  throw new Error(`The ${demo.id} demo's text script has no answer for: ${system.slice(0, 80)}`);
}

function cues(demo: Demo, user: string): string {
  const request = JSON.parse(user) as { sentences?: { text?: string }[] };
  return demoCuesFor(
    demo,
    (request.sentences ?? []).map((sentence) => sentence.text ?? ""),
  );
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

function description(demo: Demo, user: string): string {
  const passages = [...user.matchAll(/^\[(\d+:\d{2})\] (.*)$/gm)].map((match) => ({
    start: seconds(match[1] ?? "0:00"),
    text: match[2] ?? "",
  }));
  const length = seconds(/^Video length: (.*)$/m.exec(user)?.[1] ?? "0:00");
  // A passage holds several sentences: a chapter opening inside one starts as far into it as
  // its words are.
  const opening = (words: string): number | undefined => {
    const at = passages.findIndex((passage) => passage.text.includes(words));
    const passage = passages[at];
    if (passage === undefined) return undefined;
    const until = passages[at + 1]?.start ?? length;
    return (
      passage.start + ((until - passage.start) * passage.text.indexOf(words)) / passage.text.length
    );
  };
  return JSON.stringify({
    summary: demo.summary,
    chapters: demo.chapters.map((chapter, index) => ({
      start: stamp(
        index === 0 ? 0 : (opening(chapter.opens) ?? (length * index) / demo.chapters.length),
      ),
      title: chapter.title,
    })),
    hashtags: demo.hashtags,
    tags: demo.tags,
  });
}

// The short runs from the sentence that opens it to the end of the video.
function picks(demo: Demo, user: string, system: string): string {
  const sentences = [...user.matchAll(/^\[(\d+)\] \((\d+:\d{2})-(\d+:\d{2})\) (.*)$/gm)].map(
    (match) => ({
      number: Number(match[1]),
      start: seconds(match[2] ?? "0:00"),
      end: seconds(match[3] ?? "0:00"),
      text: match[4] ?? "",
    }),
  );
  const max = Number(/and (\d+) seconds/.exec(system)?.[1] ?? 60);
  const first = sentences.find((sentence) => sentence.text.includes(demo.short.opens));
  if (first === undefined) throw new Error(`No sentence opens with "${demo.short.opens}".`);
  const last = sentences.findLast((sentence) => sentence.end - first.start <= max) ?? first;
  return JSON.stringify([
    {
      first: first.number,
      last: last.number,
      title: demo.short.title,
      description: demo.short.description,
      hashtags: demo.short.hashtags,
      why: "It tells one complete moment on its own.",
    },
  ]);
}

function prompts(demo: Demo, system: string, procedural: boolean): string {
  const count = Number(/Exactly (\d+) prompt/.exec(system)?.[1] ?? 1);
  const scenes = demo.short.scenes.flatMap(
    (scene) => demo.scenes.find((one) => one.scene === scene) ?? [],
  );
  return JSON.stringify(
    Array.from({ length: count }, (_value, at) =>
      demoPrompt(demo, scenes[at % Math.max(1, scenes.length)]?.subject ?? "", true, procedural),
    ),
  );
}
