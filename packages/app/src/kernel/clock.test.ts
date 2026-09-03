import { describe, expect, it } from "vitest";
import { fixedClock, manualClock } from "./clock.fake.js";
import { systemClock } from "./clock.js";

describe("systemClock", () => {
  it("waits the asked-for time", async () => {
    const before = systemClock.now().getTime();
    await systemClock.sleep(20);
    expect(systemClock.now().getTime() - before).toBeGreaterThanOrEqual(15);
  });

  it("rejects with the signal's reason when the wait is aborted", async () => {
    const controller = new AbortController();
    const waiting = systemClock.sleep(60_000, controller.signal);
    controller.abort(new Error("canceled by user"));
    await expect(waiting).rejects.toThrow("canceled by user");
  });

  it("rejects at once when the signal is already aborted", async () => {
    await expect(systemClock.sleep(60_000, AbortSignal.abort())).rejects.toThrow();
  });
});

describe("manualClock", () => {
  it("moves time only when the work is settled, in due order", async () => {
    const clock = manualClock("2026-09-02T10:00:00.000Z");
    const seen: string[] = [];
    const work = (async (): Promise<string> => {
      await clock.sleep(2000);
      seen.push(clock.now().toISOString());
      await clock.sleep(8000);
      seen.push(clock.now().toISOString());
      return "done";
    })();
    expect(clock.now().toISOString()).toBe("2026-09-02T10:00:00.000Z");
    expect(await clock.settle(work)).toBe("done");
    expect(seen).toEqual(["2026-09-02T10:00:02.000Z", "2026-09-02T10:00:10.000Z"]);
    expect(clock.waits).toEqual([2000, 8000]);
  });

  it("wakes the earliest timer first", async () => {
    const clock = manualClock();
    const order: number[] = [];
    const work = Promise.all([
      clock.sleep(30_000).then(() => order.push(30_000)),
      clock.sleep(2000).then(() => order.push(2000)),
    ]);
    await clock.settle(work);
    expect(order).toEqual([2000, 30_000]);
  });

  it("rejects a sleep whose signal aborts and forgets its timer", async () => {
    const clock = manualClock();
    const controller = new AbortController();
    const waiting = clock.sleep(2000, controller.signal);
    controller.abort(new Error("stop"));
    await expect(waiting).rejects.toThrow("stop");
    expect(clock.pending()).toBe(0);
  });

  it("says so rather than hanging when nothing can settle the work", async () => {
    const clock = manualClock();
    await expect(clock.settle(new Promise<void>(() => {}))).rejects.toThrow(
      "no timer pending and the work has not settled",
    );
  });
});

describe("fixedClock", () => {
  it("stamps one instant and never waits", async () => {
    const clock = fixedClock("2026-09-02T10:00:00.000Z");
    await clock.sleep(30_000);
    expect(clock.now().toISOString()).toBe("2026-09-02T10:00:00.000Z");
  });
});
