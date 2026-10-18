import { describe, expect, it } from "vitest";
import { bufferForecast, type ForecastRun, type ForecastSchedule } from "./buffer.js";

const now = new Date("2026-10-18T10:00:00.000Z");
const until = new Date("2026-12-17T10:00:00.000Z");
const day = (n: number) => new Date(now.valueOf() + n * 86_400_000 + 3_600_000).toISOString();
const daily: ForecastSchedule = {
  id: "s1",
  name: "Daily",
  paused: false,
  queued: 0,
  generation: "off",
  generationFailing: false,
  cadence: { kind: "daily", time: "11:00" },
  timezone: "UTC",
};
const run = (n: number, extra: Partial<ForecastRun> = {}): ForecastRun => ({
  at: day(n),
  scheduleId: "s1",
  paused: false,
  topicSource: "queued",
  prepared: null,
  ...extra,
});

describe("bufferForecast", () => {
  it("has nothing to forecast without schedules", () => {
    expect(bufferForecast({ now, until, runs: [], ready: 4, schedules: [] })).toEqual({
      readyCount: 4,
      daysAhead: null,
      coveredUntil: null,
      runsDryAt: null,
      coveredBeyondWindow: false,
      perSchedule: [],
    });
  });

  it("covers runs in time order with prepared runs first, then ready videos", () => {
    const forecast = bufferForecast({
      now,
      until,
      runs: [run(3), run(1), run(2, { prepared: "p9" }), run(5)],
      ready: 2,
      schedules: [{ ...daily, queued: 4 }],
    });
    expect(forecast.readyCount).toBe(3);
    expect(forecast.coveredUntil).toBe(day(3));
    expect(forecast.daysAhead).toBe(5);
    expect(forecast.coveredBeyondWindow).toBe(false);
  });

  it("reads every run covered as a floor at the window's end", () => {
    const forecast = bufferForecast({ now, until, runs: [run(1)], ready: 3, schedules: [daily] });
    expect(forecast.daysAhead).toBe(60);
    expect(forecast.coveredBeyondWindow).toBe(true);
  });

  it("says when a queue with no topic finding runs dry: the occurrence after its last topic", () => {
    const forecast = bufferForecast({
      now,
      until,
      runs: [run(1), run(2)],
      ready: 0,
      schedules: [{ ...daily, queued: 2 }],
    });
    expect(forecast.daysAhead).toBe(1);
    expect(forecast.perSchedule[0]?.runsDryAt).toBe("2026-10-21T11:00:00.000Z");
    expect(forecast.runsDryAt).toBe("2026-10-21T11:00:00.000Z");
  });

  it("never runs dry while a schedule runs its template as saved, or its queue reaches past the window", () => {
    const template = bufferForecast({
      now,
      until,
      runs: [run(1, { topicSource: "template" })],
      ready: 0,
      schedules: [daily],
    });
    expect(template.runsDryAt).toBeNull();
    const long = bufferForecast({
      now,
      until,
      runs: [run(1)],
      ready: 0,
      schedules: [{ ...daily, queued: 90 }],
    });
    expect(long.runsDryAt).toBeNull();
  });

  it("runs dry at the first run past the approved topics when new ones wait for approval", () => {
    const forecast = bufferForecast({
      now,
      until,
      runs: [run(1), run(2, { topicSource: "held" }), run(3, { topicSource: "generated" })],
      ready: 0,
      schedules: [{ ...daily, queued: 1, generation: "hold" }],
    });
    expect(forecast.runsDryAt).toBe(day(2));
  });

  it("trusts a schedule that finds its own topics, until finding them fails", () => {
    const runs = [run(1), run(2, { topicSource: "generated" })];
    const schedule = { ...daily, queued: 1, generation: "queue" as const };
    expect(
      bufferForecast({ now, until, runs, ready: 0, schedules: [schedule] }).runsDryAt,
    ).toBeNull();
    const failing = bufferForecast({
      now,
      until,
      runs,
      ready: 0,
      schedules: [{ ...schedule, generationFailing: true }],
    });
    expect(failing.runsDryAt).toBe(day(2));
    expect(failing.perSchedule[0]).toMatchObject({ generating: "queue", generationFailing: true });
  });

  it("leaves a paused schedule's runs out: they fill nothing and never run dry", () => {
    const forecast = bufferForecast({
      now,
      until,
      runs: [run(1, { paused: true })],
      ready: 0,
      schedules: [{ ...daily, paused: true, queued: 1 }],
    });
    expect(forecast.daysAhead).toBeNull();
    expect(forecast.perSchedule[0]).toMatchObject({ paused: true, runsDryAt: null });
  });
});
