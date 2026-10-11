import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { awayMessage, awaySummary, readSnapshot, snapshotOf, writeSnapshot } from "./away.js";

describe("awaySummary", () => {
  it("counts runs that finished, failed or stopped for you while away", () => {
    const summary = awaySummary(
      {
        at: 0,
        states: { a: "running", b: "running", c: "pending", d: "running", e: "done" },
        waiting: {},
        stepFailures: [],
      },
      [
        { id: "a", status: "done", progress: 1 },
        { id: "b", status: "failed", progress: 1 },
        // A queued video that ran and finished while away.
        { id: "c", status: "partial", progress: 1 },
        { id: "d", status: "pending", progress: 0.5 },
        // Already done before: nothing new.
        { id: "e", status: "done", progress: 1 },
        // Started by a schedule while away and finished.
        { id: "f", status: "done", progress: 1 },
        // Started while away and still waiting its turn: not news.
        { id: "g", status: "pending", progress: 0 },
      ],
    );
    expect(summary).toEqual({ finished: 3, failed: 1, waiting: 1, stepsFailed: 0 });
    expect(awayMessage(summary)).toBe(
      "While you were away: 3 runs finished, 1 run failed, 1 run waits for you.",
    );
  });

  it("says nothing when nothing changed", () => {
    expect(
      awayMessage(
        awaySummary({ at: 0, states: { a: "done" }, waiting: {}, stepFailures: [] }, [
          { id: "a", status: "done", progress: 1 },
        ]),
      ),
    ).toBe(undefined);
  });
});

// A step failed beside one held for the person: the run waits for them, its step failed (the
// person's decision, 2026-10-10: told right away), and it is a failure only once nothing else
// can go on.
it("counts a run whose step failed beside the person's wait as waiting, then as failed", () => {
  const before = { at: 0, states: { a: "running" as const }, waiting: {}, stepFailures: [] };
  const failedBeside = {
    id: "a",
    status: "pending" as const,
    progress: 0,
    stepFailed: true,
    stepFailures: ["audio@1"],
  };
  const summary = awaySummary(before, [failedBeside]);
  expect(summary).toEqual({ finished: 0, failed: 0, waiting: 1, stepsFailed: 1 });
  expect(awayMessage(summary)).toBe(
    "While you were away: 1 step failed beside a wait, 1 run waits for you.",
  );
  expect(awaySummary(before, [{ id: "a", status: "failed", progress: 0 }])).toEqual({
    finished: 0,
    failed: 1,
    waiting: 0,
    stepsFailed: 0,
  });
  // Already failed when the page last looked: not news.
  expect(awaySummary(snapshotOf(0, [failedBeside]), [failedBeside])).toMatchObject({
    stepsFailed: 0,
  });
});

// Beside an agent's review or a prepared run's day, nobody is waited for, but the step failed.
it("counts a step failed beside a wait for the agent or the run's day", () => {
  const before = snapshotOf(0, [{ id: "a", status: "running", progress: 0.2 }]);
  expect(
    awaySummary(before, [
      {
        id: "a",
        status: "pending",
        progress: 0.2,
        stepFailed: true,
        stepFailures: ["audio@1"],
        waitingForAgent: true,
      },
    ]),
  ).toEqual({ finished: 0, failed: 0, waiting: 0, stepsFailed: 1 });
});

// The person's decision (2026-10-11): a step that fails while another waits is told right away
// even while a third still runs, so it counts here too; one in a run with nothing waiting is the
// run's to tell when it ends (the list carries no `stepFailures` for it).
it("counts a step failed beside a wait while the run still runs", () => {
  const before = snapshotOf(0, [{ id: "a", status: "running", progress: 0.2 }]);
  expect(
    awaySummary(before, [{ id: "a", status: "running", progress: 0.3, stepFailures: ["audio@1"] }]),
  ).toEqual({ finished: 0, failed: 0, waiting: 0, stepsFailed: 1 });
});

// The same rule as Home's Needs you (`waitsForPerson`): a run waiting for the agent or prepared
// for its day waits for nobody, and one already waiting when the page last looked is not news.
it("counts as waiting for you only the runs that newly wait for the person", () => {
  const summary = awaySummary(
    {
      at: 0,
      states: {
        a: "running",
        b: "running",
        c: "pending",
        d: "pending",
        e: "running",
        f: "running",
      },
      waiting: { d: "held" },
      stepFailures: [],
    },
    [
      { id: "a", status: "pending", progress: 0.5, waitingForAgent: true },
      { id: "b", status: "pending", progress: 0.9, prepared: true },
      // The agent answered, and the run then reached the person's own checkpoint.
      { id: "c", status: "pending", progress: 0.6 },
      { id: "d", status: "pending", progress: 0.5 },
      { id: "e", status: "paused", progress: 0.5 },
      { id: "f", status: "pending", progress: 0.5, waitingForAgent: true },
    ],
  );
  expect(summary).toEqual({ finished: 0, failed: 0, waiting: 2, stepsFailed: 0 });
});

it("keeps in the snapshot which runs waited for the person", () => {
  expect(
    snapshotOf(5, [
      { id: "a", status: "pending", progress: 0.5 },
      { id: "b", status: "pending", progress: 0.5, waitingForAgent: true },
      { id: "c", status: "running", progress: 0.5 },
    ]),
  ).toEqual({
    at: 5,
    states: { a: "pending", b: "pending", c: "running" },
    waiting: { a: "held" },
    stepFailures: [],
  });
});

// What a run waits on is kept, not only that it waits: moved on by an agent, a run that now
// waits at another checkpoint is news.
it("counts a run that waits again at a new point since the page last looked", () => {
  const at = (checkpointId: string) => ({
    id: "a",
    status: "pending" as const,
    progress: 0.5,
    holding: [
      {
        checkpointId,
        stage: "audio" as const,
        waitsFor: "person" as const,
        revisionId: "r1",
        fingerprint: "f1",
        since: "2026-10-10T00:00:00.000Z",
      },
    ],
  });
  const before = snapshotOf(0, [at("cp-article")]);
  expect(awaySummary(before, [at("cp-article")])).toMatchObject({ waiting: 0 });
  expect(awaySummary(before, [at("cp-audio")])).toMatchObject({ waiting: 1 });
  const paused = { id: "a", status: "paused" as const, progress: 0.5 };
  expect(awaySummary(snapshotOf(0, [paused]), [at("cp-article")])).toMatchObject({ waiting: 1 });
});

const holdAt = (
  checkpointId: string,
  fingerprint = "f1",
  waitsFor: "person" | "day" = "person",
) => ({
  checkpointId,
  stage: "audio" as const,
  waitsFor,
  revisionId: "r1",
  fingerprint,
  since: "2026-10-10T00:00:00.000Z",
});
const heldAt = (...holding: ReturnType<typeof holdAt>[]) => ({
  id: "a",
  status: "pending" as const,
  progress: 0.5,
  holding,
});

// A point the run did not wait at before is news; one of its points approved while away is not.
it("counts a run that waits at a new checkpoint, not one with a checkpoint approved", () => {
  const before = snapshotOf(0, [heldAt(holdAt("cp-audio"), holdAt("cp-video"))]);
  expect(awaySummary(before, [heldAt(holdAt("cp-video"))])).toMatchObject({ waiting: 0 });
  expect(awaySummary(before, [heldAt(holdAt("cp-video"), holdAt("cp-images"))])).toMatchObject({
    waiting: 1,
  });
  // The same checkpoint for a remade item (a new fingerprint) asks again.
  expect(awaySummary(before, [heldAt(holdAt("cp-audio", "f2"))])).toMatchObject({ waiting: 1 });
  // Only the person's checkpoints count: a schedule's own hold for its day asks nothing of them.
  expect(
    awaySummary(before, [heldAt(holdAt("cp-audio"), holdAt("cp-day", "f1", "day"))]),
  ).toMatchObject({ waiting: 0 });
});

// Continued and paused again, or continued and stopped again by a restart, while away: news.
// An edit that changes the project, or moves a stopped run's meter, is not another pause or stop.
it("counts a run paused or stopped again since the page looked", () => {
  const paused = (pauseCount: number, updatedAt = "2026-10-10T08:00:00.000Z") => ({
    id: "a",
    status: "paused" as const,
    progress: 0.5,
    updatedAt,
    pauseCount,
  });
  const before = snapshotOf(0, [paused(1)]);
  expect(awaySummary(before, [paused(1, "2026-10-10T09:00:00.000Z")])).toMatchObject({
    waiting: 0,
  });
  expect(awaySummary(before, [paused(2)])).toMatchObject({ waiting: 1 });
  const stopped = (stopCount: number, progress = 0.4) => ({
    id: "a",
    status: "pending" as const,
    progress,
    stopped: true,
    stopCount,
  });
  const restarted = snapshotOf(0, [stopped(1)]);
  expect(awaySummary(restarted, [stopped(1, 0.7)])).toMatchObject({ waiting: 0 });
  expect(awaySummary(restarted, [stopped(2)])).toMatchObject({ waiting: 1 });
});

// An agent may fix a failed run, or remake a finished one, while the page is away: the run's
// new end is news either way.
it("tells a failed run that finished, and a finished one that failed, since the page looked", () => {
  expect(
    awaySummary(
      { at: 0, states: { a: "failed", b: "done", c: "failed" }, waiting: {}, stepFailures: [] },
      [
        { id: "a", status: "done", progress: 1 },
        { id: "b", status: "failed", progress: 1 },
        { id: "c", status: "failed", progress: 1 },
      ],
    ),
  ).toEqual({ finished: 1, failed: 1, waiting: 0, stepsFailed: 0 });
});

describe("the stored snapshot", () => {
  // This runner has no localStorage, so the tests bring their own.
  const stored = new Map<string, string>();
  beforeEach(() => {
    stored.clear();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => stored.set(key, value),
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("reads back what it wrote, so a run still waiting is not news on return", () => {
    const now = [
      { id: "a", status: "pending", progress: 0.5 },
      { id: "b", status: "running", progress: 0.2 },
    ] as const;
    writeSnapshot(snapshotOf(5, now));
    const before = readSnapshot();
    expect(before).toEqual(snapshotOf(5, now));
    if (before === undefined) throw new Error("a snapshot expected");
    expect(awaySummary(before, now)).toEqual({
      finished: 0,
      failed: 0,
      waiting: 0,
      stepsFailed: 0,
    });
  });

  // Kept before it said who waited, it can't tell news from old: no summary this once.
  it("gives no summary from a snapshot kept before it said who waited", () => {
    stored.set("slopify.away.snapshot", JSON.stringify({ at: 5, states: { a: "pending" } }));
    expect(readSnapshot()).toBe(undefined);
    // Kept while it said only who waited, not on what.
    stored.set(
      "slopify.away.snapshot",
      JSON.stringify({ at: 5, states: { a: "pending" }, waiting: ["a"] }),
    );
    expect(readSnapshot()).toBe(undefined);
    // Kept before it said whose step failed beside a wait.
    stored.set(
      "slopify.away.snapshot",
      JSON.stringify({ at: 5, states: { a: "pending" }, waiting: { a: "held" } }),
    );
    expect(readSnapshot()).toBe(undefined);
  });

  // What the page keeps of the step failures it saw comes back as it was kept, so one already
  // seen is not news on return.
  it("reads back the step failures it saw", () => {
    const now = [
      { id: "a", status: "pending", progress: 0, stepFailed: true, stepFailures: ["audio@1"] },
    ] as const;
    writeSnapshot(snapshotOf(5, now));
    const before = readSnapshot();
    expect(before?.stepFailures).toEqual(["a audio@1"]);
    if (before === undefined) throw new Error("a snapshot expected");
    expect(awaySummary(before, now).stepsFailed).toBe(0);
  });
});

// Each failure is news once, by its identity: another step failing beside the same wait, or the
// same step failing again after Try again, is told; the one already seen is not.
it("counts each new step failure, not each run once", () => {
  const run = (failures: readonly string[]) => ({
    id: "a",
    status: "pending" as const,
    progress: 0.4,
    stepFailed: true,
    waitingForAgent: true,
    stepFailures: failures,
  });
  const before = snapshotOf(0, [run(["thumbnail@1"])]);
  expect(awaySummary(before, [run(["thumbnail@1", "images@2"])]).stepsFailed).toBe(1);
  expect(awaySummary(before, [run(["thumbnail@3"])]).stepsFailed).toBe(1);
  expect(awaySummary(before, [run(["thumbnail@1"])]).stepsFailed).toBe(0);
  expect(awayMessage({ finished: 0, failed: 0, waiting: 0, stepsFailed: 2 })).toBe(
    "While you were away: 2 steps failed beside a wait.",
  );
});
