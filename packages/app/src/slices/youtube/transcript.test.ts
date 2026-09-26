import { expect, it } from "vitest";
import {
  sentencesText,
  transcriptPassages,
  transcriptSentences,
  transcriptText,
} from "./transcript.js";

const words = (
  start: number,
  texts: readonly string[],
  each = 0.5,
): { text: string; start: number; end: number }[] =>
  texts.map((text, index) => ({
    text,
    start: start + index * each,
    end: start + index * each + each * 0.8,
  }));

it("keeps each passage's start as its time in the final video", () => {
  // The timing already counts the 2 s of silence at the start: the first word is at 2.1 s.
  const passages = transcriptPassages(words(2.1, ["Welcome", "to", "the", "keep."]));
  expect(passages).toEqual([{ start: 2.1, text: "Welcome to the keep." }]);
  expect(transcriptText(passages)).toBe("[0:02] Welcome to the keep.");
});

it("closes a passage at the first sentence end after 20 seconds", () => {
  const long = [...Array.from({ length: 44 }, () => "word"), "end."];
  const passages = transcriptPassages([
    ...words(0, long),
    ...words(22.5, ["Second", "passage", "starts."]),
  ]);
  expect(passages.map((passage) => passage.start)).toEqual([0, 22.5]);
  expect(passages[1]?.text).toBe("Second passage starts.");
});

it("does not close a short passage at a sentence end", () => {
  const passages = transcriptPassages(words(0, ["One.", "Two.", "Three."]));
  expect(passages).toHaveLength(1);
});

it("closes a passage at a pause, such as the gap between intro and body", () => {
  const passages = transcriptPassages([
    ...words(2, ["Intro", "words"]),
    ...words(8, ["Body", "words."]),
  ]);
  expect(transcriptText(passages)).toBe("[0:02] Intro words\n[0:08] Body words.");
});

it("closes a passage with no sentence end after a minute", () => {
  const passages = transcriptPassages(
    words(
      0,
      Array.from({ length: 130 }, () => "word"),
    ),
  );
  expect(passages.length).toBeGreaterThan(1);
  expect(passages[1]?.start).toBeGreaterThan(59);
  expect(passages[1]?.start).toBeLessThanOrEqual(61);
});

it("writes H:MM:SS for passages past the first hour", () => {
  expect(transcriptText(transcriptPassages(words(3725, ["Late", "words."])))).toBe(
    "[1:02:05] Late words.",
  );
});

it("has nothing to say for no words", () => {
  expect(transcriptPassages([])).toEqual([]);
});

it("numbers the sentences with their span and the words they hold, for the shorts", () => {
  const sentences = transcriptSentences([
    ...words(2, ["Harbors", "matter.", "Boats", "need", "them."]),
    // A pause of 1.5 s closes one even without a full stop.
    ...words(6, ["No", "stop"]),
    ...words(9, ["Then", "more."]),
  ]);
  expect(sentences.map((one) => [one.number, one.text, one.firstWord, one.lastWord])).toEqual([
    [1, "Harbors matter.", 0, 1],
    [2, "Boats need them.", 2, 4],
    [3, "No stop", 5, 6],
    [4, "Then more.", 7, 8],
  ]);
  expect(sentences[1]).toMatchObject({ start: 3, end: 4.4 });
  expect(sentencesText(sentences.slice(0, 1))).toBe("[1] (0:02-0:02) Harbors matter.");
});

it("closes a sentence with no full stop after 30 seconds", () => {
  const sentences = transcriptSentences(
    words(
      0,
      Array.from({ length: 100 }, () => "word"),
    ),
  );
  expect(sentences.length).toBeGreaterThan(1);
  expect(sentences.every((one) => one.end - one.start <= 30)).toBe(true);
  expect(transcriptSentences([])).toEqual([]);
});
