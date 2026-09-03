import { describe, expect, it } from "vitest";
import type { TelemetryCounters, TelemetryEvent, TelemetryEventType } from "./model.js";
import { usageOf } from "./usage.js";

// The page's totals are the sum of the local log and nothing else. Every case here is a
// hand-built log, so what the fold does with it is the whole subject;
// `test/telemetry-counters.test.ts` checks the totals against a real pipeline.

let n = 0;

function event(type: TelemetryEventType, counters: TelemetryCounters = {}): TelemetryEvent {
  n += 1;
  return {
    id: `e${String(n)}`,
    type,
    payload: { appVersion: "1.2.3", ...counters },
    createdAt: "2026-09-03T10:00:00.000Z",
    deliveredAt: null,
  };
}

function totals(events: readonly TelemetryEvent[]) {
  return usageOf({ events, machineId: "m1", appVersion: "1.2.3" });
}

describe("the Usage page's five counters", () => {
  it("reads zero from an empty log", () => {
    expect(totals([]).counters).toEqual({
      videosMade: 0,
      audioSeconds: 0,
      imagesMade: 0,
      tokensUsed: 0,
      projects: 0,
    });
    expect(totals([]).byStage).toEqual([]);
  });

  it("sums each counter over the whole log", () => {
    const usage = totals([
      event("install"),
      event("project.created"),
      event("project.created"),
      event("stage.completed", { stage: "images", images: 3 }),
      event("stage.completed", { stage: "images", images: 2 }),
      event("stage.completed", { stage: "audio", segment: "body", audioSeconds: 12.5 }),
      event("stage.completed", { stage: "audio", segment: "intro", audioSeconds: 2.25 }),
      event("stage.completed", { stage: "thumbnail", thumbnails: 1 }),
      event("stage.completed", { stage: "video" }),
      event("stage.completed", { stage: "video" }),
      event("stage.completed", { stage: "article", tokensIn: 100, tokensOut: 900 }),
    ]);

    expect(usage.counters).toEqual({
      videosMade: 2,
      audioSeconds: 14.75,
      imagesMade: 5,
      tokensUsed: 1000,
      projects: 2,
    });
  });

  // The totals come off the log, not off the delivery. A delivered event still
  // counts, which is what makes the page independent of the collector.
  it("counts an event that has already been delivered", () => {
    const delivered: TelemetryEvent = {
      ...event("stage.completed", { stage: "video" }),
      deliveredAt: "2026-09-03T10:00:01.000Z",
    };

    expect(totals([delivered]).counters.videosMade).toBe(1);
  });

  it("shows the machine id and the running app version", () => {
    expect(usageOf({ events: [], machineId: null, appVersion: "9.9.9" })).toMatchObject({
      machineId: null,
      appVersion: "9.9.9",
    });
  });
});

describe("the Tokens by stage table", () => {
  // Stage, Provider · model, Tokens in, Tokens out, sorted by tokens out. The grouping is
  // on all three, so one stage against two models is two rows.
  it("groups by stage, provider and model, and sorts by tokens out", () => {
    const usage = totals([
      event("stage.completed", {
        stage: "article",
        provider: "openrouter",
        model: "a",
        tokensIn: 1,
        tokensOut: 5,
      }),
      event("stage.completed", {
        stage: "article",
        provider: "openrouter",
        model: "a",
        tokensIn: 2,
        tokensOut: 7,
      }),
      event("stage.completed", {
        stage: "article",
        provider: "openrouter",
        model: "b",
        tokensIn: 3,
        tokensOut: 4,
      }),
      event("stage.completed", {
        stage: "research",
        provider: "claude-code",
        model: "a",
        tokensIn: 9,
        tokensOut: 90,
      }),
    ]);

    expect(usage.byStage).toEqual([
      { stage: "research", provider: "claude-code", model: "a", tokensIn: 9, tokensOut: 90 },
      { stage: "article", provider: "openrouter", model: "a", tokensIn: 3, tokensOut: 12 },
      { stage: "article", provider: "openrouter", model: "b", tokensIn: 3, tokensOut: 4 },
    ]);
  });

  // The segments are the article stage's own units, and the table is by
  // stage, so an intro's tokens sit in the article's row.
  it("folds an intro and an outro text into their stage's row", () => {
    const usage = totals([
      event("stage.completed", {
        stage: "article",
        provider: "p",
        model: "m",
        tokensIn: 10,
        tokensOut: 20,
      }),
      event("stage.completed", {
        stage: "article",
        segment: "intro",
        provider: "p",
        model: "m",
        tokensIn: 1,
        tokensOut: 2,
      }),
    ]);

    expect(usage.byStage).toEqual([
      { stage: "article", provider: "p", model: "m", tokensIn: 11, tokensOut: 22 },
    ]);
  });

  // A render reports no provider and an image call no usage, so neither has a row in a
  // table whose only two number columns are tokens.
  it("leaves out the stages that spend no tokens", () => {
    const usage = totals([
      event("stage.completed", { stage: "video" }),
      event("stage.completed", { stage: "images", provider: "fal", model: "flux", images: 4 }),
      event("stage.completed", {
        stage: "audio",
        segment: "body",
        provider: "openai",
        audioSeconds: 3,
      }),
    ]);

    expect(usage.byStage).toEqual([]);
    expect(usage.counters.imagesMade).toBe(4);
  });

  // Provider reports no token usage → 0 recorded, never estimated. A stage that only ever
  // reported zero is not a row either, but it is still counted as work done.
  it("keeps a zero-token stage out of the table without losing its other counters", () => {
    const usage = totals([
      event("stage.completed", {
        stage: "thumbnail",
        provider: "openai",
        model: "gpt-image-1",
        tokensIn: 0,
        tokensOut: 0,
        thumbnails: 1,
      }),
    ]);

    expect(usage.byStage).toEqual([]);
    expect(usage.counters.tokensUsed).toBe(0);
  });
});
