import { expect, it } from "vitest";
import { captionGroups, clipWords, shortCaptionsAss } from "./captions.js";

const timed = (texts: readonly string[], start = 0, each = 0.4) =>
  texts.map((text, at) => ({
    text,
    start: start + at * each,
    end: start + at * each + each * 0.9,
  }));

it("moves the clip's words onto its own timeline and leaves the rest out", () => {
  const words = [
    { text: "Before.", start: 8, end: 9.6 },
    { text: "Inside", start: 10.1, end: 10.5 },
    { text: "the clip.", start: 10.6, end: 11.2 },
    { text: "After.", start: 12.1, end: 12.6 },
  ];
  expect(clipWords(words, 9.9, 11.4)).toEqual([
    { text: "Inside", start: 0.2, end: 0.6 },
    { text: "the clip.", start: 0.7, end: 1.3 },
  ]);
});

it("shows two to four words at a time, breaking at sentence ends, commas and pauses", () => {
  const words = [
    ...timed(["One", "two", "three", "four", "five", "six."]),
    ...timed(["Short,", "then", "more", "words", "here"], 3),
    ...timed(["Late."], 8),
  ];
  expect(captionGroups(words).map((group) => group.map((word) => word.text).join(" "))).toEqual([
    "One two three four",
    "five six.",
    // A comma closes a group only once it holds two words.
    "Short, then more words",
    "here",
    "Late.",
  ]);
});

it("lets a word left alone join the group before it", () => {
  const words = timed(["Big", "harbors,", "small", "boats", "sail", "out", "today"]);
  // "Big harbors," closes at the comma; "small boats sail out" at four; "today" joins it
  // only if that group has room, and it does not, so it stays on its own.
  expect(captionGroups(words).map((group) => group.length)).toEqual([2, 4, 1]);
  const joined = timed(["Big", "harbors", "sail", "out", "today"]);
  expect(captionGroups(joined).map((group) => group.length)).toEqual([4, 1]);
  const room = timed(["Harbors,", "boats", "sail", "slowly", "on"]);
  expect(captionGroups(room).map((group) => group.length)).toEqual([4, 1]);
});

it("highlights the word being spoken, one event per word, centred below the middle", () => {
  const ass = shortCaptionsAss(
    [
      { text: "Big", start: 0, end: 0.4 },
      { text: "{harbors}", start: 0.5, end: 1 },
      { text: "rule.", start: 1.1, end: 1.5 },
    ],
    { width: 1080, height: 1920, fontName: "Atkinson, Bold" },
  );
  expect(ass).toContain("PlayResX: 1080\nPlayResY: 1920");
  // 7.5% of the height, bold, the project's font with the comma ASS would read as a field
  // separator taken out.
  expect(ass).toContain("Style: Short,Atkinson  Bold,144,&H00FFFFFF,&H00FFFFFF,&H00000000,");
  const events = ass.split("\n").filter((line) => line.startsWith("Dialogue:"));
  expect(events).toEqual([
    "Dialogue: 0,0:00:00.00,0:00:00.50,Short,,0,0,0,,{\\an5\\pos(540,1190)}{\\c&H0000D4FF&\\fscx108\\fscy108}Big{\\c&H00FFFFFF&\\fscx100\\fscy100} ｛harbors｝\\Nrule.",
    "Dialogue: 0,0:00:00.50,0:00:01.10,Short,,0,0,0,,{\\an5\\pos(540,1190)}Big {\\c&H0000D4FF&\\fscx108\\fscy108}｛harbors｝{\\c&H00FFFFFF&\\fscx100\\fscy100}\\Nrule.",
    "Dialogue: 0,0:00:01.10,0:00:02.00,Short,,0,0,0,,{\\an5\\pos(540,1190)}Big ｛harbors｝\\N{\\c&H0000D4FF&\\fscx108\\fscy108}rule.{\\c&H00FFFFFF&\\fscx100\\fscy100}",
  ]);
});

it("holds a group until the next begins, when that comes sooner than half a second", () => {
  const ass = shortCaptionsAss(
    [
      { text: "First.", start: 0, end: 0.5 },
      { text: "Second.", start: 0.7, end: 1 },
    ],
    { width: 1080, height: 1920, fontName: "Sans" },
  );
  const events = ass.split("\n").filter((line) => line.startsWith("Dialogue:"));
  expect(events.map((line) => line.split(",").slice(1, 3).join("-"))).toEqual([
    "0:00:00.00-0:00:00.70",
    "0:00:00.70-0:00:01.50",
  ]);
});
