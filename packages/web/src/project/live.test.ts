import type { Stage } from "@app/slices/admission/model.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProjectBody } from "@/api";
import { coalesce, liveRefetch, patchProject } from "./live.js";

function stage(over: Partial<Stage>): Stage {
  return {
    id: "s1",
    projectId: "p1",
    kind: "video",
    source: "generate",
    state: "pending",
    failureReason: null,
    attemptCount: 0,
    progressCurrent: null,
    progressTotal: null,
    startedAt: null,
    finishedAt: null,
    ...over,
  };
}

function body(stages: readonly Stage[]): ProjectBody {
  return {
    revisionId: null,
    resumable: false,
    holding: [],
    project: {
      id: "p1",
      title: "Rope Tricks",
      format: "16:9",
      status: "running",
      config: {} as ProjectBody["project"]["config"],
      createdAt: "2026-09-03T00:00:00.000Z",
      updatedAt: "2026-09-03T00:00:00.000Z",
    },
    stages,
    outputs: [],
  };
}

describe("patching the cached project from an event", () => {
  it("flips a stage's state where it stands", () => {
    const patched = patchProject(body([stage({ kind: "audio" }), stage({ kind: "video" })]), {
      type: "stage.state",
      projectId: "p1",
      stage: "video",
      state: "running",
    });
    expect(patched?.stages.map((row) => row.state)).toEqual(["pending", "running"]);
  });

  it("carries the provider's failure reason across unaltered", () => {
    const verbatim =
      "fal.ai: 429 Too Many Requests after 4 attempts (2s, 8s, 30s, Retry-After 45s)";
    const patched = patchProject(body([stage({ kind: "images" })]), {
      type: "stage.state",
      projectId: "p1",
      stage: "images",
      state: "failed",
      failureReason: verbatim,
    });
    expect(patched?.stages[0]?.failureReason).toBe(verbatim);
  });

  it("keeps the reason the row already held when the event carries none", () => {
    const patched = patchProject(
      body([stage({ kind: "images", state: "failed", failureReason: "kept" })]),
      { type: "stage.state", projectId: "p1", stage: "images", state: "running" },
    );
    expect(patched?.stages[0]?.failureReason).toBe("kept");
  });

  it("moves a meter without touching anything else", () => {
    const patched = patchProject(body([stage({ kind: "video", state: "running" })]), {
      type: "stage.progress",
      projectId: "p1",
      stage: "video",
      current: 42,
      total: 100,
    });
    expect(patched?.stages[0]?.progressCurrent).toBe(42);
    expect(patched?.stages[0]?.progressTotal).toBe(100);
  });

  it("writes the project's own state word", () => {
    const patched = patchProject(body([stage({})]), {
      type: "project.state",
      projectId: "p1",
      state: "canceled",
    });
    expect(patched?.project.status).toBe("canceled");
  });

  it("leaves an empty cache empty, because there is nothing to patch yet", () => {
    expect(
      patchProject(undefined, { type: "project.state", projectId: "p1", state: "done" }),
    ).toBeUndefined();
  });

  it("leaves the body alone when the event names a stage this project has not got", () => {
    const before = body([stage({ kind: "video" })]);
    expect(
      patchProject(before, { type: "stage.state", projectId: "p1", stage: "audio", state: "done" }),
    ).toBe(before);
  });
});

describe("coalescing the refetches an event burst asks for", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("runs the first ask at once, so one event is never delayed", () => {
    vi.useFakeTimers();
    const run = vi.fn();
    coalesce(run, 100).ask();
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("folds a burst into one more run at the end of the window", () => {
    vi.useFakeTimers();
    const run = vi.fn();
    const coalescer = coalesce(run, 100);
    for (let at = 0; at < 60; at += 1) {
      coalescer.ask();
    }
    expect(run).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(100);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("does not run a second time when the burst was a single ask", () => {
    vi.useFakeTimers();
    const run = vi.fn();
    coalesce(run, 100).ask();
    vi.advanceTimersByTime(1000);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("opens a fresh window once the last one has closed", () => {
    vi.useFakeTimers();
    const run = vi.fn();
    const coalescer = coalesce(run, 100);
    coalescer.ask();
    vi.advanceTimersByTime(200);
    coalescer.ask();
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("drops the pending run when the page goes away", () => {
    vi.useFakeTimers();
    const run = vi.fn();
    const coalescer = coalesce(run, 100);
    coalescer.ask();
    coalescer.ask();
    coalescer.stop();
    vi.advanceTimersByTime(1000);
    expect(run).toHaveBeenCalledTimes(1);
  });
});

describe("turning a run's events into requests", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function watching() {
    vi.useFakeTimers();
    const everything = vi.fn();
    const meter = vi.fn();
    return { everything, meter, live: liveRefetch({ everything, meter }) };
  }

  it("answers a progress report with the meter alone, at once", () => {
    const { everything, meter, live } = watching();
    live.progress();
    expect(meter).toHaveBeenCalledTimes(1);
    expect(everything).not.toHaveBeenCalled();
  });

  it("reads the meter once a second however fast the reports come", () => {
    const { meter, live } = watching();
    // Several steps side by side, each reporting twice a second, for ten seconds.
    for (let at = 0; at < 100; at += 1) {
      live.progress();
      vi.advanceTimersByTime(100);
    }
    expect(meter.mock.calls.length).toBeGreaterThanOrEqual(10);
    expect(meter.mock.calls.length).toBeLessThanOrEqual(11);
  });

  it("asks for everything once in five seconds of progress reports, and never at the first", () => {
    const { everything, live } = watching();
    for (let at = 0; at < 100; at += 1) {
      live.progress();
      vi.advanceTimersByTime(100);
    }
    expect(everything).toHaveBeenCalledTimes(2);
  });

  it("asks for everything once more after the last progress report", () => {
    const { everything, live } = watching();
    live.progress();
    vi.advanceTimersByTime(4999);
    expect(everything).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(everything).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(60_000);
    expect(everything).toHaveBeenCalledTimes(1);
  });

  it("asks for everything at once when anything else happens", () => {
    const { everything, meter, live } = watching();
    live.all();
    expect(everything).toHaveBeenCalledTimes(1);
    expect(meter).not.toHaveBeenCalled();
  });

  it("folds a burst of other events into one more ask", () => {
    const { everything, live } = watching();
    for (let at = 0; at < 60; at += 1) live.all();
    expect(everything).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(200);
    expect(everything).toHaveBeenCalledTimes(2);
  });

  it("asks for nothing more once the page has gone", () => {
    const { everything, meter, live } = watching();
    live.all();
    live.all();
    live.progress();
    live.progress();
    live.stop();
    vi.advanceTimersByTime(60_000);
    expect(everything).toHaveBeenCalledTimes(1);
    expect(meter).toHaveBeenCalledTimes(1);
  });
});
