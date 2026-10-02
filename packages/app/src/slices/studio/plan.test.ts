import { expect, it } from "vitest";
import { comingSlots, defaultPlan, nextOccurrence, scheduleOf, zonedInstant } from "./plan.js";

const plan = defaultPlan("Europe/Berlin");

it("names a wall-clock time in the plan's zone, across a clock change", () => {
  // 20:00 in Berlin is 18:00 UTC in summer time and 19:00 UTC in winter time.
  expect(
    zonedInstant(
      "Europe/Berlin",
      { year: 2026, month: 10, day: 4, weekday: 0 },
      "20:00",
    ).toISOString(),
  ).toBe("2026-10-04T18:00:00.000Z");
  expect(
    zonedInstant(
      "Europe/Berlin",
      { year: 2026, month: 11, day: 1, weekday: 0 },
      "20:00",
    ).toISOString(),
  ).toBe("2026-11-01T19:00:00.000Z");
  // New York: 14:00 is 18:00 UTC in daylight time.
  expect(
    zonedInstant(
      "America/New_York",
      { year: 2026, month: 10, day: 4, weekday: 0 },
      "14:00",
    ).toISOString(),
  ).toBe("2026-10-04T18:00:00.000Z");
});

it("gives the coming long-video slots in time order, A, B, C, week by week", () => {
  // Friday 2 October 2026, noon in Berlin.
  const slots = comingSlots(plan, new Date("2026-10-02T10:00:00Z")).slice(0, 4);
  expect(slots).toEqual([
    { row: "A", longAt: "2026-10-04T18:00:00.000Z" },
    { row: "B", longAt: "2026-10-06T18:00:00.000Z" },
    { row: "C", longAt: "2026-10-08T18:00:00.000Z" },
    { row: "A", longAt: "2026-10-11T18:00:00.000Z" },
  ]);
});

it("puts each short at the first time its day and hour come round after its own video", () => {
  const c = scheduleOf(plan, { row: "C", longAt: "2026-10-08T18:00:00.000Z" });
  expect(c.shortsAt).toEqual([
    "2026-10-08T22:00:00.000Z", // Fri 00:00
    "2026-10-09T22:00:00.000Z", // Sat 00:00
    "2026-10-10T19:00:00.000Z", // Sat 21:00
    "2026-10-10T22:00:00.000Z", // Sun 00:00, the following Sunday
    "2026-10-11T15:00:00.000Z", // Sun 17:00
  ]);
  expect(
    nextOccurrence(
      "Europe/Berlin",
      { day: 4, time: "20:00" },
      new Date("2026-10-08T18:00:00Z"),
    ).toISOString(),
  ).toBe("2026-10-15T18:00:00.000Z");
});
