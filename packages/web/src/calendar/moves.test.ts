import type { Calendar, CalendarRun } from "@app/slices/schedules/schema.js";
import { describe, expect, it } from "vitest";
import { optimisticMove, undoOf } from "./moves";

const run = (index: number, topic: string, scheduleId = "s1"): CalendarRun => ({
  at: `2026-10-0${String(index + 5)}T09:00:00.000Z`,
  scheduleId,
  scheduleName: "Lore",
  scheduleVersion: 3,
  paused: false,
  templateId: "t1",
  templateVersion: 1,
  templateName: null,
  index,
  topic,
  topicSource: "queued",
  renderedTitle: null,
  prepared: null,
});

describe("undoOf", () => {
  it("moves a topic back at the version the move left", () => {
    expect(
      undoOf(
        { kind: "move", scheduleId: "s1", baseVersion: 3, from: 2, to: 0 },
        { source: { version: 4, items: [] } },
      ),
    ).toEqual({ kind: "move", scheduleId: "s1", baseVersion: 4, from: 0, to: 2 });
  });

  it("takes a transferred topic back from the end of the other queue to its old place", () => {
    expect(
      undoOf(
        {
          kind: "transfer",
          scheduleId: "s1",
          baseVersion: 3,
          index: 1,
          targetId: "s2",
          position: undefined,
        },
        { source: { version: 4, items: [1] }, target: { version: 8, items: [1, 2, 3] } },
      ),
    ).toEqual({
      kind: "transfer",
      scheduleId: "s2",
      baseVersion: 8,
      index: 2,
      targetId: "s1",
      position: 1,
    });
  });
});

describe("optimisticMove", () => {
  it("shows each run with the topic at its new place before the server answers", () => {
    const calendar: Calendar = {
      from: "",
      to: "",
      runs: [run(0, "A"), run(1, "B"), run(2, "C"), run(0, "X", "s2")],
      projects: [],
      queued: [],
    };
    const moved = optimisticMove(calendar, {
      kind: "move",
      scheduleId: "s1",
      baseVersion: 3,
      from: 2,
      to: 0,
    });
    expect(moved.runs.map((one) => one.topic)).toEqual(["C", "A", "B", "X"]);
    expect(moved.runs.map((one) => one.at)).toEqual(calendar.runs.map((one) => one.at));
  });
});
