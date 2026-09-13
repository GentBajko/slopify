import { describe, expect, it } from "vitest";
import { cadenceSchema, nextOccurrence, validTimeZone } from "./calendar.js";

const now = new Date("2026-09-13T10:00:00.000Z");

describe("schedule calendar", () => {
  for (const kind of ["daily", "weekly"] as const) {
    it(`${kind} chooses the earlier overlap and never schedules the second occurrence`, () => {
      const cadence =
        kind === "daily" ? { kind, time: "02:30" } : { kind, time: "02:30", days: [0] };
      expect(
        nextOccurrence(cadence, "Europe/Berlin", new Date("2027-10-30T22:00:00Z"))?.toISOString(),
      ).toBe("2027-10-31T00:30:00.000Z");
      expect(
        nextOccurrence(cadence, "Europe/Berlin", new Date("2027-10-31T00:45:00Z"))?.toISOString(),
      ).toBe(kind === "daily" ? "2027-11-01T01:30:00.000Z" : "2027-11-07T01:30:00.000Z");
    });
    it(`${kind} shifts nonexistent spring-forward times by the gap`, () => {
      const cadence =
        kind === "daily" ? { kind, time: "02:30" } : { kind, time: "02:30", days: [0] };
      expect(
        nextOccurrence(cadence, "Europe/Berlin", new Date("2027-03-27T23:00:00Z"))?.toISOString(),
      ).toBe("2027-03-28T01:30:00.000Z");
    });
  }
  it("converts a daily local time to the next UTC occurrence", () => {
    const next = nextOccurrence({ kind: "daily", time: "12:30" }, "Europe/Tirane", now);
    expect(next?.toISOString()).toBe("2026-09-13T10:30:00.000Z");
  });

  it("finds the next selected weekday and skips today's passed time", () => {
    const next = nextOccurrence({ kind: "weekly", time: "09:00", days: [0] }, "UTC", now);
    expect(next?.toISOString()).toBe("2026-09-20T09:00:00.000Z");
  });

  it("rejects invalid zones and past one-off times", () => {
    expect(validTimeZone("Mars/Olympus")).toBe(false);
    expect(nextOccurrence({ kind: "once", at: "2026-09-13T09:00:00.000Z" }, "UTC", now)).toBeNull();
  });

  it("accepts only the supported cadence shapes", () => {
    expect(cadenceSchema.safeParse({ kind: "daily", time: "09:15" }).success).toBe(true);
    expect(cadenceSchema.safeParse({ kind: "daily", time: "9:15" }).success).toBe(false);
  });
});
