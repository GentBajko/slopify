import { describe, expect, it } from "vitest";
import { cadenceSchema, nextOccurrence, validTimeZone } from "./calendar.js";

const now = new Date("2026-09-13T10:00:00.000Z");

describe("schedule calendar", () => {
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
