import { expect, it, vi } from "vitest";
import { formatScheduleDate, localScheduleTime, scheduleInstant } from "./time";

it("resolves selected-zone time independently of the browser zone", () => {
  expect(scheduleInstant("2027-01-15T12:00", "America/New_York")).toBe("2027-01-15T17:00:00.000Z");
  expect(localScheduleTime("2027-01-15T17:00:00.000Z", "America/New_York")).toBe(
    "2027-01-15T12:00",
  );
  expect(formatScheduleDate("2027-01-15T17:00:00.000Z", "America/New_York")).toBe(
    new Intl.DateTimeFormat(undefined, {
      timeZone: "America/New_York",
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date("2027-01-15T17:00:00.000Z")),
  );
});

it("rejects nonexistent spring-forward time and uses the earlier repeated time", () => {
  expect(scheduleInstant("2027-10-31T02:30", "Europe/Berlin")).toBe("2027-10-31T00:30:00.000Z");
  expect(() => scheduleInstant("2027-03-28T02:30", "Europe/Berlin")).toThrow(
    "skipped in this timezone",
  );
  expect(() => scheduleInstant("2027-10-03T02:15", "Australia/Lord_Howe")).toThrow(
    "skipped in this timezone",
  );
  expect(() => scheduleInstant("2027-03-14T02:30", "America/New_York")).toThrow(
    "skipped in this timezone",
  );
  expect(scheduleInstant("2027-11-07T01:30", "America/New_York")).toBe("2027-11-07T05:30:00.000Z");
  expect(() => scheduleInstant("2027-02-30T12:00", "UTC")).toThrow();
  expect(() => scheduleInstant("2027-01-15T12:00", "Not/AZone")).toThrow();
});

it("uses the bundled Temporal implementation when the browser has no native one", () => {
  vi.stubGlobal("Temporal", undefined);
  try {
    expect(scheduleInstant("2027-01-15T12:00", "America/New_York")).toBe(
      "2027-01-15T17:00:00.000Z",
    );
    expect(localScheduleTime("2027-01-15T17:00:00Z", "America/New_York")).toBe("2027-01-15T12:00");
  } finally {
    vi.unstubAllGlobals();
  }
});
