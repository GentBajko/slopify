import { expect, it } from "vitest";
import { validateCues } from "./rules.js";

it("refuses overlap and narration overrun without rewriting cues", () => {
  const cues = [
    { id: "a", text: "First", start: 0, end: 2 },
    { id: "b", text: "Second", start: 1, end: 5 },
  ];
  expect(validateCues(cues, 4).map((one) => one.field)).toEqual([
    "content.subtitleCues.cues.1.start",
    "content.subtitleCues.cues.1.end",
  ]);
  expect(cues[1]).toEqual({ id: "b", text: "Second", start: 1, end: 5 });
  expect(validateCues([{ id: "a", text: "Good", start: 0, end: 4 }], 4)).toEqual([]);
});
