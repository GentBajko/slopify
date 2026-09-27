import { describe, expect, it } from "vitest";
import { type BackupConfig, type BackupStatus, emptyStatus } from "./model.js";
import { catchUpFreshMs, decideBackup, latestSlot, startupDelayMs } from "./schedule.js";

const config: BackupConfig = {
  enabled: true,
  time: "03:00",
  timeZone: "UTC",
  keep: 5,
  folder: null,
  enabledAt: "2026-09-01T00:00:00.000Z",
};
const bootedLongAgo = new Date("2026-09-20T00:00:00.000Z");
const at = (iso: string): Date => new Date(iso);

function decide(
  now: string,
  status: Partial<BackupStatus> = {},
  overrides: Partial<BackupConfig> = {},
  bootedAt = bootedLongAgo,
) {
  return decideBackup({
    config: { ...config, ...overrides },
    status: { ...emptyStatus, ...status },
    now: at(now),
    bootedAt,
    running: false,
  });
}

describe("latestSlot", () => {
  it("is today's time once it has passed, yesterday's before", () => {
    expect(latestSlot("03:00", "UTC", at("2026-09-27T03:00:00.000Z"))?.toISOString()).toBe(
      "2026-09-27T03:00:00.000Z",
    );
    expect(latestSlot("03:00", "UTC", at("2026-09-27T02:59:59.000Z"))?.toISOString()).toBe(
      "2026-09-26T03:00:00.000Z",
    );
  });

  it("reads the time in the configured zone", () => {
    // 03:00 in Berlin (UTC+2 in September) is 01:00 UTC.
    expect(
      latestSlot("03:00", "Europe/Berlin", at("2026-09-27T12:00:00.000Z"))?.toISOString(),
    ).toBe("2026-09-27T01:00:00.000Z");
  });
});

describe("decideBackup", () => {
  it("never runs while off or while a backup is running", () => {
    expect(decide("2026-09-27T03:01:00.000Z", {}, { enabled: false })).toEqual({
      due: false,
      reason: "off",
    });
    expect(
      decideBackup({
        config,
        status: emptyStatus,
        now: at("2026-09-27T03:01:00.000Z"),
        bootedAt: bootedLongAgo,
        running: true,
      }),
    ).toEqual({ due: false, reason: "running" });
  });

  it("is due at the slot when nothing succeeded since it", () => {
    expect(
      decide("2026-09-27T03:00:30.000Z", { lastSuccessAt: "2026-09-26T03:05:00.000Z" }),
    ).toEqual({ due: true, slot: "2026-09-27T03:00:00.000Z", trigger: "scheduled" });
  });

  it("runs at most once per slot", () => {
    expect(
      decide("2026-09-27T15:00:00.000Z", { lastSuccessAt: "2026-09-27T03:04:00.000Z" }),
    ).toEqual({ due: false, reason: "done" });
  });

  it("waits for the first slot after it is turned on", () => {
    expect(
      decide("2026-09-27T14:00:00.000Z", {}, { enabledAt: "2026-09-27T13:59:00.000Z" }),
    ).toEqual({ due: false, reason: "not-yet" });
    expect(
      decide("2026-09-28T03:00:10.000Z", {}, { enabledAt: "2026-09-27T13:59:00.000Z" }),
    ).toMatchObject({ due: true, trigger: "scheduled" });
  });

  it("catches up shortly after a start when the slot passed while Slopify was off", () => {
    const booted = at("2026-09-27T09:00:00.000Z");
    const status = { lastSuccessAt: "2026-09-26T03:02:00.000Z" };
    expect(decide("2026-09-27T09:00:30.000Z", status, {}, booted)).toEqual({
      due: false,
      reason: "starting",
    });
    const later = new Date(booted.valueOf() + startupDelayMs).toISOString();
    expect(decide(later, status, {}, booted)).toEqual({
      due: true,
      slot: "2026-09-27T03:00:00.000Z",
      trigger: "catch-up",
    });
  });

  it("skips the catch-up when a backup succeeded within about a day", () => {
    const booted = at("2026-09-27T09:00:00.000Z");
    const recent = new Date(booted.valueOf() - catchUpFreshMs + 60 * 60_000).toISOString();
    expect(decide("2026-09-27T09:10:00.000Z", { lastSuccessAt: recent }, {}, booted)).toEqual({
      due: false,
      reason: "done",
    });
  });

  it("retries a failed slot after an hour, a waiting one after ten minutes", () => {
    const failed = {
      lastSlot: "2026-09-27T03:00:00.000Z",
      lastAttemptAt: "2026-09-27T03:00:10.000Z",
      lastResult: "failed" as const,
    };
    expect(decide("2026-09-27T03:30:00.000Z", failed)).toEqual({
      due: false,
      reason: "retry-later",
    });
    expect(decide("2026-09-27T04:00:10.000Z", failed)).toMatchObject({ due: true });
    const waiting = { ...failed, lastResult: "waiting" as const };
    expect(decide("2026-09-27T03:05:00.000Z", waiting)).toEqual({
      due: false,
      reason: "retry-later",
    });
    expect(decide("2026-09-27T03:10:10.000Z", waiting)).toMatchObject({ due: true });
  });
});
