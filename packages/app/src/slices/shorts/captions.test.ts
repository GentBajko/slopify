import { expect, it } from "vitest";
import {
  captionGroups,
  clipWords,
  fasterWords,
  shortCaptionsAss,
  titleLayout,
} from "./captions.js";

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
    // A comma closes a group only once it holds two words. "here" would be left alone and
    // "Short, then more words here" is too wide, so "words" comes over to keep it company.
    "Short, then more",
    "words here",
    // After three seconds of silence a word stays alone rather than hold the words before
    // it on screen through the pause.
    "Late.",
  ]);
});

const texts = (groups: readonly (readonly { readonly text: string }[])[]) =>
  groups.map((group) => group.map((word) => word.text).join(" "));

it("never leaves a word alone when a neighbour can take it", () => {
  // Room in the group before: the lone word joins it, as long as no line grows wider.
  expect(texts(captionGroups(timed(["Harbors,", "boats", "sail", "slowly", "on"])))).toEqual([
    "Harbors, boats sail slowly on",
  ]);
  // Too wide to take it: the nearest word of the group before makes a pair with it.
  expect(texts(captionGroups(timed(["Big", "harbors", "sail", "out", "today"])))).toEqual([
    "Big harbors sail",
    "out today",
  ]);
  expect(
    texts(captionGroups(timed(["Big", "harbors,", "small", "boats", "sail", "out", "today"]))),
  ).toEqual(["Big harbors,", "small boats sail", "out today"]);
  // A word opening a sentence joins the words after it first, and a first word alone joins
  // the group after it.
  expect(texts(captionGroups(timed(["The", "end", "of", "it.", "So", "we", "go", "on."])))).toEqual(
    ["The end of it.", "So we go on."],
  );
  expect(
    texts(captionGroups([{ text: "Wait.", start: 0, end: 0.4 }, ...timed(["It", "works."], 0.6)])),
  ).toEqual(["Wait. It works."]);
  // Only between two short groups that cannot fit it does it stay alone.
  expect(
    texts(
      captionGroups([
        ...timed(["Extraordinarily,", "unbelievably."]),
        ...timed(["Incomprehensibly."], 0.8),
        ...timed(["Unquestionably,", "irrevocably."], 1.2),
      ]),
    ),
  ).toEqual([
    "Extraordinarily, unbelievably.",
    "Incomprehensibly.",
    "Unquestionably, irrevocably.",
  ]);
});

it("keeps the words on what is heard when the clip plays faster", () => {
  expect(fasterWords([{ text: "Hi", start: 1.25, end: 2.5 }], 1.25)).toEqual([
    { text: "Hi", start: 1, end: 2 },
  ]);
  const same = [{ text: "Hi", start: 1, end: 2 }];
  expect(fasterWords(same, 1)).toBe(same);
});

it("draws the title as a bold headline near the top for the whole short", () => {
  const ass = shortCaptionsAss([{ text: "Hi.", start: 0, end: 0.4 }], {
    width: 1080,
    height: 1920,
    fontName: "Barlow Bold",
    title: { text: "Why harbors glow at night", seconds: 42.5 },
  });
  expect(ass).toContain(
    "Style: Title,Barlow Bold,115,&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,-1,",
  );
  const title = ass.split("\n").find((line) => line.includes(",Title,"));
  // Two lines at 115 px (17 characters each), top-centred below the apps' own buttons, on a
  // layer above the captions, from the first frame to the last.
  expect(title).toBe(
    "Dialogue: 1,0:00:00.00,0:00:42.50,Title,,0,0,0,,{\\an8\\pos(540,211)}Why harbors\\Nglow at night",
  );
  expect(shortCaptionsAss([], { width: 1080, height: 1920, fontName: "Sans" })).not.toContain(
    "Title",
  );
});

it("fits a long title on two lines, smaller if it must, and cuts one that never fits", () => {
  const frame = { width: 1080, height: 1920 };
  expect(titleLayout("Harbors that glow", frame)).toEqual({
    size: 115,
    lines: ["Harbors that glow"],
  });
  expect(titleLayout("The harbor that glows every single night of the year", frame)).toEqual({
    size: 67,
    lines: ["The harbor that glows every", "single night of the year"],
  });
  const long = titleLayout(
    "Everything nobody ever told you about harbors, lighthouses, tides and the night sea",
    frame,
  );
  expect(long.lines).toHaveLength(2);
  expect(long.size).toBeLessThan(115);
  const cut = titleLayout("word ".repeat(40), frame);
  expect(cut.lines).toHaveLength(2);
  expect(cut.lines.at(-1)?.endsWith("…")).toBe(true);
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
      { text: "The", start: 0, end: 0.2 },
      { text: "first.", start: 0.25, end: 0.5 },
      { text: "The", start: 0.7, end: 0.8 },
      { text: "second.", start: 0.85, end: 1 },
    ],
    { width: 1080, height: 1920, fontName: "Sans" },
  );
  const events = ass.split("\n").filter((line) => line.startsWith("Dialogue:"));
  expect(events.map((line) => line.split(",").slice(1, 3).join("-"))).toEqual([
    "0:00:00.00-0:00:00.25",
    "0:00:00.25-0:00:00.70",
    "0:00:00.70-0:00:00.85",
    "0:00:00.85-0:00:01.50",
  ]);
});

it("shows each group whole, with no word lit, when word times are only estimates", () => {
  const ass = shortCaptionsAss(
    [
      { text: "Привет,", start: 0, end: 0.3 },
      { text: "друг.", start: 0.3, end: 0.5 },
      { text: "Как", start: 0.7, end: 0.9 },
      { text: "дела?", start: 0.9, end: 1.2 },
    ],
    { width: 1080, height: 1920, fontName: "Sans", wordByWord: false },
  );
  const events = ass.split("\n").filter((line) => line.startsWith("Dialogue:"));
  expect(events).toHaveLength(2);
  expect(ass).not.toContain("\\fscx108");
  expect(events[1]).toContain("Как дела?");
  expect(events[1]?.split(",").slice(1, 3).join("-")).toBe("0:00:00.70-0:00:01.70");
});
