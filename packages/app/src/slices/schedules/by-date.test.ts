import { describe, expect, it } from "vitest";
import { designOccurrences, nextDesignOccurrence, rowDate } from "./by-date.js";

const row = (Date: string, Event = "Gig") => ({ values: { Event, Date } });
const now = new Date("2026-10-18T10:00:00.000Z");

describe("when a design schedule makes each row's piece", () => {
  it.each([
    // [rows, daysBefore, time, zone, expected at, index, over]
    [
      "one row a week ahead",
      [row("2026-11-14")],
      7,
      "09:00",
      "UTC",
      "2026-11-07T09:00:00.000Z",
      0,
      false,
    ],
    [
      "the zone's own 09:00",
      [row("2026-11-14")],
      7,
      "09:00",
      "Europe/Zurich",
      "2026-11-07T08:00:00.000Z",
      0,
      false,
    ],
    [
      "summer time",
      [row("2027-07-14")],
      0,
      "09:00",
      "Europe/Zurich",
      "2027-07-14T07:00:00.000Z",
      0,
      false,
    ],
    [
      "on the day itself",
      [row("2026-10-25")],
      0,
      "18:30",
      "America/New_York",
      "2026-10-25T22:30:00.000Z",
      0,
      false,
    ],
    [
      "the soonest of several",
      [row("2026-12-01"), row("2026-11-20")],
      3,
      "09:00",
      "UTC",
      "2026-11-17T09:00:00.000Z",
      1,
      false,
    ],
    [
      "a missed day is made now",
      [row("2026-10-20")],
      7,
      "09:00",
      "UTC",
      "2026-10-18T10:00:00.000Z",
      0,
      false,
    ],
    [
      "an event later today is still made",
      [row("2026-10-18")],
      0,
      "08:00",
      "UTC",
      "2026-10-18T10:00:00.000Z",
      0,
      false,
    ],
    [
      "a past event is due now, to be skipped",
      [row("2026-10-17"), row("2026-11-14")],
      7,
      "09:00",
      "UTC",
      "2026-10-18T10:00:00.000Z",
      0,
      true,
    ],
  ] as const)("%s", (_name, rows, daysBefore, time, zone, at, index, over) => {
    expect(nextDesignOccurrence(rows, "Date", daysBefore, time, zone, now)).toEqual({
      at: new Date(at),
      index,
      over,
    });
  });

  it("has nothing to make without a row holding a date", () => {
    expect(nextDesignOccurrence([], "Date", 7, "09:00", "UTC", now)).toBeNull();
    expect(
      nextDesignOccurrence(
        [row("14.11.2026"), row(""), row("2026-02-30")],
        "Date",
        7,
        "09:00",
        "UTC",
        now,
      ),
    ).toBeNull();
    expect(
      nextDesignOccurrence([row("2026-11-14")], "Date", 7, "09:00", "Mars/Olympus", now),
    ).toBeNull();
  });

  it("keeps the table's order for rows due at the same moment", () => {
    const rows = [row("2026-11-14", "A"), row("2026-11-14", "B")];
    expect(designOccurrences(rows, "Date", 7, "09:00", "UTC", now).map((one) => one.index)).toEqual(
      [0, 1],
    );
  });

  it("reads only real dates written YYYY-MM-DD", () => {
    expect(rowDate(row(" 2026-11-14 "), "Date")?.toString()).toBe("2026-11-14");
    expect(rowDate(row("2026-13-01"), "Date")).toBeUndefined();
    expect(rowDate({ values: {} }, "Date")).toBeUndefined();
  });
});
