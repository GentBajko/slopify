import type { StageKind, StageState } from "@app/kernel/pipeline.js";
import type { Stage } from "@app/slices/admission/model.js";
import { describe, expect, it } from "vitest";
import { measuredEta, runPosition, runStep } from "./measured-eta.js";

function stage(kind: StageKind, state: StageState, over: Partial<Stage> = {}): Stage {
  return {
    id: `s-${kind}`,
    projectId: "p1",
    kind,
    source: "generate",
    state,
    failureReason: null,
    attemptCount: 0,
    progressCurrent: null,
    progressTotal: null,
    startedAt: null,
    finishedAt: null,
    ...over,
  };
}

const t0 = Date.parse("2026-09-03T00:10:00.000Z");

describe("the measured time left", () => {
  // The Video stage counted its quick caption step as half its work, so it said "under a minute
  // left" while the render crept from 0% to 18% over three minutes.
  it("times a render by its own percent as the page watched it move", () => {
    const memory = new Map();
    const rendering = (percent: number) =>
      stage("video", "running", {
        startedAt: "2026-09-03T00:00:00.000Z",
        progressCurrent: 1.18,
        progressTotal: 2,
        activity: { label: "rendering the video", percent },
      });
    // The first reading starts the clock: no time yet.
    expect(measuredEta(rendering(0), t0, memory)).toEqual({ basis: "unknown" });
    // 18% in 3 minutes: the other 82% takes about 13.7 minutes more.
    expect(measuredEta(rendering(18), t0 + 180_000, memory)).toEqual({
      basis: "progress",
      seconds: 820,
    });
  });

  it("starts the clock again when the measure starts again, and waits until it moves", () => {
    const memory = new Map();
    const at = (percent: number) =>
      stage("video", "running", { activity: { label: "rendering the shorts", percent } });
    expect(measuredEta(at(40), t0, memory)).toEqual({ basis: "unknown" });
    expect(measuredEta(at(40), t0 + 60_000, memory)).toEqual({ basis: "unknown" });
    // A second render begins at 0: its own clock.
    expect(measuredEta(at(0), t0 + 70_000, memory)).toEqual({ basis: "unknown" });
    expect(measuredEta(at(10), t0 + 80_000, memory)).toEqual({ basis: "progress", seconds: 90 });
  });

  // Named but not measured yet: the render before its first percent said "under a minute
  // left" from the stage's count of steps.
  it("says nothing about a named step's time until it has a measure, and counts things done", () => {
    const memory = new Map();
    const named = stage("video", "running", {
      startedAt: "2026-09-03T00:09:50.000Z",
      progressCurrent: 1,
      progressTotal: 2,
      activity: { label: "rendering the video" },
    });
    expect(measuredEta(named, t0, memory)).toEqual({ basis: "unknown" });
    const drawing = (done: number) =>
      stage("video", "running", {
        activity: { label: "drawing the shorts' pictures", done, total: 10 },
      });
    expect(measuredEta(drawing(2), t0, memory)).toEqual({ basis: "unknown" });
    // 2 more of 10 in 40 s: the last 6 take about 2 minutes.
    expect(measuredEta(drawing(4), t0 + 40_000, memory)).toEqual({
      basis: "progress",
      seconds: 120,
    });
  });

  it("keeps the stage's own estimate for a step without a percent", () => {
    const counted = stage("images", "running", {
      startedAt: "2026-09-03T00:09:00.000Z",
      progressCurrent: 1,
      progressTotal: 2,
    });
    expect(measuredEta(counted, t0, new Map())).toEqual({ basis: "progress", seconds: 60 });
    expect(measuredEta(stage("images", "done"), t0, new Map())).toBeUndefined();
  });
});

describe("where the run stands", () => {
  const stages = [
    stage("research", "skipped"),
    stage("article", "done"),
    stage("audio", "done"),
    stage("images", "done"),
    stage("thumbnail", "done"),
    stage("video", "running"),
  ];

  // The title row said "Step 4 of 4" while Progress said "3 of 4" over five listed steps.
  it("counts the step the run is at, in sections, the one way every place says it", () => {
    expect(runStep(stages)).toBe("Step 4 of 4");
    expect(runStep([stage("article", "running"), stage("video", "pending")])).toBe("Step 1 of 2");
    expect(runStep([])).toBeUndefined();
  });

  it("names the step at work after the count", () => {
    expect(runPosition(stages, t0, (kind) => (kind === "video" ? "Audiobook" : kind))).toBe(
      "Step 4 of 4 · Audiobook",
    );
    expect(runPosition([stage("video", "done")], t0, String)).toBeUndefined();
  });
});
