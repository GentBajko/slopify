import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { awayMessage, awaySummary, readSnapshot, snapshotOf, writeSnapshot } from "./away.js";

describe("awaySummary", () => {
  it("counts runs that finished, failed or stopped for you while away", () => {
    const summary = awaySummary(
      {
        at: 0,
        states: { a: "running", b: "running", c: "pending", d: "running", e: "done" },
        waiting: {},
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
    expect(summary).toEqual({ finished: 3, failed: 1, waiting: 1 });
    expect(awayMessage(summary)).toBe(
      "While you were away: 3 runs finished, 1 run failed, 1 run waits for you.",
    );
  });

  it("says nothing when nothing changed", () => {
    expect(
      awayMessage(
        awaySummary({ at: 0, states: { a: "done" }, waiting: {} }, [
          { id: "a", status: "done", progress: 1 },
        ]),
      ),
    ).toBe(undefined);
  });
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
  expect(summary).toEqual({ finished: 0, failed: 0, waiting: 2 });
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

// An agent may fix a failed run, or remake a finished one, while the page is away: the run's
// new end is news either way.
it("tells a failed run that finished, and a finished one that failed, since the page looked", () => {
  expect(
    awaySummary({ at: 0, states: { a: "failed", b: "done", c: "failed" }, waiting: {} }, [
      { id: "a", status: "done", progress: 1 },
      { id: "b", status: "failed", progress: 1 },
      { id: "c", status: "failed", progress: 1 },
    ]),
  ).toEqual({ finished: 1, failed: 1, waiting: 0 });
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
    expect(awaySummary(before, now)).toEqual({ finished: 0, failed: 0, waiting: 0 });
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
  });
});
