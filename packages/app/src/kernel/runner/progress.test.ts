import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { StageProgressEvent } from "../events.js";
import { progressGate } from "./progress.js";

const at = (current: number, total = 100): StageProgressEvent => ({
  type: "stage.progress",
  projectId: "p1",
  stage: "video",
  current,
  total,
});

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

it("sends the first report at once and the newest held one when the interval ends", () => {
  const sent: number[] = [];
  const gate = progressGate((event) => sent.push(event.current), 500);
  for (let current = 0; current <= 20; current += 1) gate.offer(at(current));
  expect(sent).toEqual([0]);
  vi.advanceTimersByTime(500);
  expect(sent).toEqual([0, 20]);
  vi.advanceTimersByTime(500);
  expect(sent).toEqual([0, 20]);
});

it("drops a report that repeats the last value sent", () => {
  const sent: number[] = [];
  const gate = progressGate((event) => sent.push(event.current), 500);
  gate.offer(at(5));
  vi.advanceTimersByTime(500);
  gate.offer(at(5));
  gate.offer(at(5));
  vi.advanceTimersByTime(1000);
  expect(sent).toEqual([5]);
});

it("holds thousands of chunk reports to two a second", () => {
  const sent: number[] = [];
  const gate = progressGate((event) => sent.push(event.current), 500);
  // A 95 MB download read in 16 KB chunks over 30 seconds.
  for (let chunk = 0; chunk < 6000; chunk += 1) {
    gate.offer(at(Math.round((chunk / 6000) * 20)));
    vi.advanceTimersByTime(5);
  }
  expect(sent.length).toBeLessThanOrEqual(21);
});

it("flushes the held report when the stage finishes and drops it when the stage stops", () => {
  const finished: number[] = [];
  const done = progressGate((event) => finished.push(event.current), 500);
  done.offer(at(1));
  done.offer(at(2));
  done.flush();
  done.close();
  vi.advanceTimersByTime(1000);
  expect(finished).toEqual([1, 2]);

  const stopped: number[] = [];
  const failed = progressGate((event) => stopped.push(event.current), 500);
  failed.offer(at(1));
  failed.offer(at(2));
  failed.close();
  vi.advanceTimersByTime(1000);
  failed.offer(at(3));
  expect(stopped).toEqual([1]);
});
