import { describe, expect, it } from "vitest";
import { awayMessage, awaySummary, snapshotOf } from "./away.js";

describe("awaySummary", () => {
  it("counts runs that finished, failed or stopped for you while away", () => {
    const summary = awaySummary(
      {
        at: 0,
        states: { a: "running", b: "running", c: "pending", d: "running", e: "done" },
        waiting: [],
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
        awaySummary({ at: 0, states: { a: "done" }, waiting: [] }, [
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
      waiting: ["d"],
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
  ).toEqual({ at: 5, states: { a: "pending", b: "pending", c: "running" }, waiting: ["a"] });
});
