import { expect, it } from "vitest";
import { fixedClock } from "../../kernel/clock.fake.js";
import { openDb } from "../../kernel/db/index.js";
import { migrate } from "../../kernel/db/migrate.js";
import {
  markWeeklySent,
  readSnoozes,
  setWeeklyNotify,
  snoozeWarning,
  weeklyNotifyOf,
  weeklySentFor,
} from "./repo.js";

function db() {
  const one = openDb(":memory:");
  migrate(one, fixedClock("2026-10-18T10:00:00.000Z"));
  return one;
}

it("keeps a hidden warning until its snooze ends, then forgets it", () => {
  const d = db();
  snoozeWarning(d, "disk-low", new Date("2026-10-25T10:00:00.000Z"));
  snoozeWarning(d, "disk-low", new Date("2026-10-26T10:00:00.000Z"));
  expect([...readSnoozes(d, new Date("2026-10-20T00:00:00.000Z"))]).toEqual([
    ["disk-low", "2026-10-26T10:00:00.000Z"],
  ]);
  expect(readSnoozes(d, new Date("2026-10-27T00:00:00.000Z")).size).toBe(0);
  expect(d.prepare("SELECT count(*) AS n FROM autopilot_snoozes").get()).toEqual({ n: 0 });
});

it("keeps the weekly report off until turned on, and remembers the week it was sent for", () => {
  const d = db();
  expect(weeklyNotifyOf(d)).toBe(false);
  setWeeklyNotify(d, true);
  expect(weeklyNotifyOf(d)).toBe(true);
  expect(weeklySentFor(d)).toBeUndefined();
  markWeeklySent(d, "2026-W43");
  expect(weeklySentFor(d)).toBe("2026-W43");
});
