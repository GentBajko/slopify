import { describe, expect, it } from "vitest";
import type { AudioSegment } from "../video/edit-list.js";
import { bodyWindow, bodyWords, savedClips } from "./runtime-shorts.js";

// A short's render reads its clip from the version's pick. On a project from before an
// older fingerprint scheme the pick is kept under another fingerprint than the plan's.
const clip = {
  number: 1,
  first: 1,
  last: 2,
  start: 0,
  end: 60,
  title: "A title",
  description: "A description",
  hashtags: [],
  why: "Why",
  text: "Some words.",
};
const snapshot = (fingerprint: string, planned: readonly string[]) =>
  ({
    plan: {
      recipes: [
        { key: "shorts:pick", fingerprint: "plan-fp" },
        ...planned.map((key) => ({ key, fingerprint: `fp-${key}` })),
      ],
    },
    view: {
      revision: {
        config: { shorts: { count: 1, minSeconds: 30, maxSeconds: 120 } },
        content: {},
      },
      pieces: [
        {
          key: "shorts:pick",
          fingerprint,
          selected: true,
          piece: { state: "done", payload: JSON.stringify({ shorts: [clip] }) },
        },
      ],
    },
  }) as unknown as Parameters<typeof savedClips>[0];

describe("the clips a short's render reads", () => {
  it("are the pick's when it carries the plan's fingerprint", () => {
    expect(savedClips(snapshot("plan-fp", [])).map((one) => one.number)).toEqual([1]);
  });
  it("are the version's one pick when the plan planned its clips from it", () => {
    expect(savedClips(snapshot("older-fp", ["shorts:1:render"])).map((one) => one.number)).toEqual([
      1,
    ]);
  });
  it("are none when the plan did not plan clips from that pick", () => {
    expect(savedClips(snapshot("older-fp", []))).toEqual([]);
  });
});

// Shorts on the body's clock: the pick reads the body's words timed from its start, and the
// render finds the body where it starts now, so a clip cut before a new intro plays the same
// words after it.
describe("the body's clock", () => {
  const timeline = (intro: number): readonly AudioSegment[] => [
    { kind: "edge", path: null, seconds: 0.5 },
    { kind: "intro", path: "/intro.wav", seconds: intro },
    { kind: "gap", path: null, seconds: 1 },
    { kind: "body", path: "/body.wav", seconds: 100 },
    { kind: "gap", path: null, seconds: 1 },
    { kind: "outro", path: "/outro.wav", seconds: 8 },
    { kind: "edge", path: null, seconds: 0.5 },
  ];
  // The word timing of each: the intro's words, then the body's at its start, then the outro's.
  const words = (intro: number) => {
    const start = bodyWindow(timeline(intro)).start;
    return [
      { word: "Welcome", start: 0.6, end: 1.2 },
      { word: "Once", start: start + 0.2, end: start + 0.6 },
      { word: "upon", start: start + 40, end: start + 40.4 },
      { word: "Goodnight", start: start + 102, end: start + 102.6 },
    ];
  };

  it("starts after the edge silence, the intro and the gap", () => {
    expect(bodyWindow(timeline(10))).toEqual({ start: 11.5, seconds: 100 });
    expect(bodyWindow([{ kind: "body", path: "/body.wav", seconds: 60 }])).toEqual({
      start: 0,
      seconds: 60,
    });
  });

  it("holds the body's words alone, at the same times whatever the intro", () => {
    const short = bodyWords(words(10), bodyWindow(timeline(10)));
    const long = bodyWords(words(25), bodyWindow(timeline(25)));
    expect(short.map((word) => word.word)).toEqual(["Once", "upon"]);
    expect(long.map(({ word, start, end }) => [word, start, end])).toEqual(
      short.map(({ word, start, end }) => [word, start, end]),
    );
    expect(short[1]).toMatchObject({ start: 40, end: 40.4 });
  });

  it("puts a clip picked before a new intro back on the same words of the video", () => {
    // Picked at 39.8-41 on the body's clock; played on a video whose intro is now 15 s longer.
    const at = bodyWindow(timeline(25)).start;
    const played = words(25).filter(
      (word) => (word.start + word.end) / 2 >= 39.8 + at && (word.start + word.end) / 2 <= 41 + at,
    );
    expect(played.map((word) => word.word)).toEqual(["upon"]);
  });
});
