import { describe, expect, it } from "vitest";
import { dueAt, readyNow, tooLate, waitsForRelease } from "./due.js";

const now = new Date("2026-10-18T10:00:00.000Z");
const at = (minutes: number) => new Date(now.getTime() + minutes * 60_000).toISOString();

describe("due posts", () => {
  it("waits for the release time only on sites without a scheduler", () => {
    expect(["instagram", "bluesky", "reddit"].every((one) => waitsForRelease(one as "x"))).toBe(
      true,
    );
    expect(waitsForRelease("x")).toBe(false);
  });

  it("fills a scheduler site's post now, whatever its release time", () => {
    expect(readyNow("tiktok", at(600), now)).toBe(true);
  });

  it("fills a no-scheduler post two minutes before its release, or now without one", () => {
    expect(readyNow("instagram", at(3), now)).toBe(false);
    expect(readyNow("instagram", at(2), now)).toBe(true);
    expect(readyNow("instagram", null, now)).toBe(true);
    expect(readyNow("instagram", "not a time", now)).toBe(true);
  });

  it("lists a post due within the horizon, and a late one up to 12 hours", () => {
    expect(dueAt("bluesky", at(60), now, 3_600_000)).toEqual({ at: at(58), late: false });
    expect(dueAt("bluesky", at(200), now, 3_600_000)).toBeUndefined();
    expect(dueAt("bluesky", at(-60), now, 3_600_000)).toEqual({ at: at(-62), late: true });
    expect(dueAt("bluesky", at(-12 * 60 - 1), now, 3_600_000)).toBeUndefined();
    expect(dueAt("x", at(10), now, 3_600_000)).toBeUndefined();
    expect(dueAt("reddit", null, now, 3_600_000)).toBeUndefined();
  });

  it("calls a post more than 12 hours past its release too late", () => {
    expect(tooLate("reddit", at(-12 * 60 - 1), now)).toBe(true);
    expect(tooLate("reddit", at(-60), now)).toBe(false);
    expect(tooLate("x", at(-9999), now)).toBe(false);
  });
});
