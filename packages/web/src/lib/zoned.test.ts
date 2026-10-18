import { expect, it } from "vitest";
import { fromZonedInput, zonedDayKey, zonedFormat, zonedInput, zonedTime, zoneName } from "./zoned";

const at = "2026-10-20T19:00:00.000Z"; // 20:00 in London (BST), 21:00 in Tirane (CEST)
const clock = (zone: string) =>
  new Intl.DateTimeFormat(undefined, { timeZone: zone, timeStyle: "short" }).format(new Date(at));

it("reads a schedule's time in its own zone and names the zone when it isn't the browser's", () => {
  expect(zonedTime(at, "Europe/London", "Europe/Tirane")).toBe(`${clock("Europe/London")} London`);
  expect(zonedTime(at, "Europe/London", "Europe/London")).toBe(clock("Europe/London"));
  // Another zone at the same offset at that moment reads the same, so needs no name.
  expect(zonedTime(at, "Europe/London", "Europe/Lisbon")).toBe(clock("Europe/London"));
  // No zone of its own: the browser's clock, whichever zone this machine is in.
  expect(zonedTime(at, undefined, "Europe/Tirane")).toBe(
    new Intl.DateTimeFormat(undefined, { timeStyle: "short" }).format(new Date(at)),
  );
});

it("names zones the way people say them", () => {
  expect(zoneName("Europe/London")).toBe("London");
  expect(zoneName("America/New_York")).toBe("New York");
  expect(zoneName("UTC")).toBe("UTC");
});

it("puts a run on its zone's own day", () => {
  // 23:30 in New York is already the next day in Tirane.
  const late = "2026-10-21T03:30:00.000Z";
  expect(zonedDayKey(late, "America/New_York")).toBe("2026-10-20");
  expect(zonedDayKey(late, "Europe/Tirane")).toBe("2026-10-21");
});

it("formats a date in the zone and falls back to the browser for an unknown one", () => {
  const day = { weekday: "short", day: "numeric", month: "short" } as const;
  expect(zonedFormat(at, "Pacific/Kiritimati", day)).toBe(
    new Intl.DateTimeFormat(undefined, { ...day, timeZone: "Pacific/Kiritimati" }).format(
      new Date(at),
    ),
  );
  expect(zonedFormat(at, "Not/AZone", day)).toBe(
    new Intl.DateTimeFormat(undefined, day).format(new Date(at)),
  );
});

it("edits a time as the zone's own wall clock and reads it back to the same instant", () => {
  expect(zonedInput(at, "Europe/London")).toBe("2026-10-20T20:00");
  expect(zonedInput(at, "Europe/Tirane")).toBe("2026-10-20T21:00");
  expect(fromZonedInput("2026-10-20T20:00", "Europe/London")).toBe(at);
  // Across the clocks going back in London (25 October), each side keeps its own offset.
  expect(fromZonedInput("2026-10-26T20:00", "Europe/London")).toBe("2026-10-26T20:00:00.000Z");
  expect(fromZonedInput("2026-10-20T21:00", "Europe/Tirane")).toBe(at);
});
