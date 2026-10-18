import { expect, it } from "vitest";
import { scheduleSentence } from "./cost.js";

it("says what a schedule call really starts", () => {
  expect(scheduleSentence("create_schedule")).toBe(
    "It starts active: runs start at the schedule's times and are paid then.",
  );
  expect(scheduleSentence("update_schedule")).toBe(
    "Runs start at the schedule's times and are paid then; a paused schedule stays paused, so nothing runs until you resume it.",
  );
  expect(scheduleSentence("resume_schedule")).toBe(
    "Runs start again at the schedule's times and are paid then.",
  );
  expect(scheduleSentence("pause_schedule")).toBeUndefined();
});
