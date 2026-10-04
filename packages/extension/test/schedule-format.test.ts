import { expect, it } from "vitest";
import { sameDay, sameTime, typedDate, typedTime } from "../src/studio-pages.js";

// 6 October 2026, 17:00 in the browser's own zone.
const at = new Date(2026, 9, 6, 17, 0);

it("types the date and time the way Studio's fields already show them", () => {
  expect(typedDate("Oct 4, 2026", at)).toBe("Oct 6, 2026");
  expect(typedDate("4 Oct 2026", at)).toBe("6 Oct 2026");
  expect(typedTime("8:00 PM", at)).toBe("5:00 PM");
  expect(typedTime("20:00", at)).toBe("17:00");
});

it("reads a kept date and time in either format", () => {
  expect(sameDay("Oct 6, 2026", at)).toBe(true);
  expect(sameDay("6 Oct 2026", at)).toBe(true);
  expect(sameDay("Oct 7, 2026", at)).toBe(false);
  expect(sameTime("5:00 PM", at)).toBe(true);
  expect(sameTime("17:00", at)).toBe(true);
  expect(sameTime("5:00 AM", at)).toBe(false);
});
