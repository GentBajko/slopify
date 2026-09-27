import { describe, expect, it } from "vitest";
import { captionCues, serializeAss, serializeSrt, serializeVtt } from "../subtitles/captions.js";
import type { CaptionSpeakers } from "./palette.js";
import { speakerPanelEvents, speakerRuns } from "./panel.js";
import { attributeWords, turnStarts } from "./timing.js";

const turns = [
  { speaker: "alex", turn: 1, text: "Hello there, friend." },
  { speaker: "sam", turn: 2, text: "Hi Alex - how are you?" },
  { speaker: "alex", turn: 3, text: "Fine." },
];
const word = (text: string, start: number) => ({ text, start, end: start + 0.3 });

describe("attributeWords", () => {
  it("gives each timed word the speaker and turn it came from", () => {
    const words = attributeWords(turns, [
      word("Hello", 0),
      word("there,", 0.4),
      word("friend.", 0.8),
      word("Hi", 1.5),
      // The aligner joined the dash onto the word before it.
      word("Alex -", 1.9),
      word("how", 2.3),
      // "are" was not heard; "you?" still lands on Sam's turn.
      word("you?", 2.7),
      word("Fine.", 3.5),
    ]);
    expect(words.map((one) => [one.text, one.speaker, one.turn])).toEqual([
      ["Hello", "alex", 1],
      ["there,", "alex", 1],
      ["friend.", "alex", 1],
      ["Hi", "sam", 2],
      ["Alex -", "sam", 2],
      ["how", "sam", 2],
      ["you?", "sam", 2],
      ["Fine.", "alex", 3],
    ]);
    expect([...turnStarts(words)]).toEqual([
      [1, 0],
      [2, 1.5],
      [3, 3.5],
    ]);
  });

  it("keeps the speaker before a word it cannot find", () => {
    const words = attributeWords(turns, [word("Hello", 0), word("Howdy", 0.4)]);
    expect(words.map((one) => one.speaker)).toEqual(["alex", "alex"]);
  });
});

const speakers: CaptionSpeakers = {
  styles: {
    alex: { name: "Alex", colour: "#f2c14e" },
    sam: { name: "Sam", colour: "#6ec3f4" },
  },
  nameTags: true,
};

describe("speaker captions", () => {
  const cues = captionCues([
    { text: "Hello", start: 0, end: 0.3, speaker: "alex" },
    { text: "there", start: 0.35, end: 0.6, speaker: "alex" },
    { text: "Hi", start: 0.65, end: 0.9, speaker: "sam" },
  ]);

  it("never puts two speakers in one cue, and each cue carries its speaker", () => {
    expect(cues).toEqual([
      { start: 0, end: 0.6, text: "Hello there", speaker: "alex" },
      { start: 0.65, end: 0.9, text: "Hi", speaker: "sam" },
    ]);
  });

  it("leaves cues without speakers exactly as before", () => {
    expect(
      captionCues([
        { text: "Hello", start: 0, end: 0.3 },
        { text: "there", start: 0.35, end: 0.6 },
      ]),
    ).toEqual([{ start: 0, end: 0.6, text: "Hello there" }]);
  });

  it("names and colours the speaker in every caption file", () => {
    expect(serializeSrt(cues, speakers)).toContain("Alex: Hello there");
    expect(serializeSrt(cues, { ...speakers, nameTags: false })).not.toContain("Alex:");
    expect(serializeVtt(cues, speakers)).toContain("<v Sam>Hi");
    const ass = serializeAss(cues, {
      width: 1920,
      height: 1080,
      fontName: "Font",
      fontSize: 48,
      speakers,
      overlay: ["Dialogue: 1,0:00:00.00,0:00:01.00,Default,,0,0,0,,panel"],
    });
    expect(ass).toContain("{\\1c&H4EC1F2&}{\\b1}Alex:{\\b0} Hello there");
    expect(ass).toContain("{\\1c&HF4C36E&}{\\b1}Sam:{\\b0} Hi");
    expect(ass.trimEnd().endsWith("panel")).toBe(true);
  });
});

describe("speaker panel", () => {
  it("lights one speaker at a time through their run of cues", () => {
    const runs = speakerRuns([
      { start: 0, end: 1, text: "a", speaker: "alex" },
      { start: 1.2, end: 2, text: "b", speaker: "alex" },
      { start: 2.1, end: 3, text: "c", speaker: "sam" },
      { start: 5, end: 6, text: "d", speaker: "sam" },
    ]);
    expect(runs).toEqual([
      { speaker: "alex", start: 0, end: 2 },
      { speaker: "sam", start: 2.1, end: 3 },
      { speaker: "sam", start: 5, end: 6 },
    ]);
  });

  it("draws a tile per speaker and a lit tile and lower third per run", () => {
    const events = speakerPanelEvents(
      [
        { start: 0, end: 1, text: "a", speaker: "alex" },
        { start: 1.1, end: 2, text: "b", speaker: "sam" },
      ],
      [
        { id: "alex", name: "Alex Moore", colour: "#f2c14e" },
        { id: "sam", name: "Sam", colour: "#6ec3f4" },
      ],
      { width: 1920, height: 1080 },
      10,
    );
    expect(events).toHaveLength(8);
    expect(events.filter((line) => line.includes("}AM"))).toHaveLength(1);
    expect(events.filter((line) => line.includes("}SA"))).toHaveLength(1);
    expect(
      events.some(
        (line) => line.startsWith("Dialogue: 2,0:00:01.10,0:00:02.00") && line.endsWith("}Sam"),
      ),
    ).toBe(true);
  });
});
