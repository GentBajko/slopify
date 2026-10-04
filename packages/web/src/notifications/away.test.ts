import { describe, expect, it } from "vitest";
import { awayMessage, awaySummary } from "./away.js";

describe("awaySummary", () => {
  it("counts runs that finished, failed or stopped for you while away", () => {
    const summary = awaySummary(
      {
        at: 0,
        states: { a: "running", b: "running", c: "pending", d: "running", e: "done" },
      },
      [
        { id: "a", status: "done" },
        { id: "b", status: "failed" },
        // A queued video that ran and finished while away.
        { id: "c", status: "partial" },
        { id: "d", status: "pending" },
        // Already done before: nothing new.
        { id: "e", status: "done" },
        // Started by a schedule while away and finished.
        { id: "f", status: "done" },
        // Started while away and still waiting its turn: not news.
        { id: "g", status: "pending" },
      ],
    );
    expect(summary).toEqual({ finished: 3, failed: 1, waiting: 1 });
    expect(awayMessage(summary)).toBe(
      "While you were away: 3 runs finished, 1 run failed, 1 run waits for you.",
    );
  });

  it("says nothing when nothing changed", () => {
    expect(
      awayMessage(awaySummary({ at: 0, states: { a: "done" } }, [{ id: "a", status: "done" }])),
    ).toBe(undefined);
  });
});
