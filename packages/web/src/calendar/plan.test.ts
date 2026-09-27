import type { CalendarRun } from "@app/slices/schedules/schema.js";
import { describe, expect, it } from "vitest";
import { byDay, dayKey, mondayOf, neighbour, planDrop, runTitle, weekDays } from "./plan.js";

const run = (over: Partial<CalendarRun> = {}): CalendarRun => ({
  at: "2026-09-29T09:00:00.000Z",
  scheduleId: "s1",
  scheduleName: "Lore",
  scheduleVersion: 4,
  paused: false,
  templateId: "t1",
  templateVersion: 1,
  templateName: "Stories",
  index: 0,
  topic: "Cleopatra",
  topicSource: "queued",
  renderedTitle: null,
  ...over,
});

describe("the weeks", () => {
  it("start on the Monday of this week and run Monday to Sunday", () => {
    // A Sunday.
    const sunday = new Date(2026, 8, 27, 15);
    expect(dayKey(mondayOf(sunday))).toBe("2026-09-21");
    const rows = weekDays(sunday, 4);
    expect(rows).toHaveLength(4);
    expect(rows[0]?.map((date) => date.getDay())).toEqual([1, 2, 3, 4, 5, 6, 0]);
    expect(dayKey(rows[3]?.[6] ?? new Date())).toBe("2026-10-18");
  });

  it("put a run on its day, a finished project on the day it finished, and leave batch items out", () => {
    const days = byDay(
      {
        from: "",
        to: "",
        runs: [run({ at: new Date(2026, 8, 29, 9).toISOString() })],
        projects: [
          {
            id: "p1",
            title: "Done",
            state: "done",
            createdAt: "",
            finishedAt: new Date(2026, 8, 28, 12).toISOString(),
            scheduleId: null,
          },
          {
            id: "p2",
            title: "Queued",
            state: "pending",
            createdAt: "",
            finishedAt: null,
            scheduleId: null,
          },
        ],
        queued: [
          {
            projectId: "p2",
            title: "Queued",
            batchId: "b",
            position: 0,
            state: "queued",
            queuedAt: "",
          },
        ],
      },
      new Date(2026, 8, 27, 10),
    );
    expect(days.get("2026-09-29")?.runs).toHaveLength(1);
    expect(days.get("2026-09-28")?.projects.map((one) => one.id)).toEqual(["p1"]);
    expect([...days.values()].flatMap((day) => day.projects.map((one) => one.id))).not.toContain(
      "p2",
    );
  });
});

describe("a drop", () => {
  it("on another run of the same schedule moves the topic to that place", () => {
    expect(planDrop(run({ index: 2 }), run({ index: 0 }), "Monday")).toEqual({
      kind: "move",
      scheduleId: "s1",
      baseVersion: 4,
      from: 2,
      to: 0,
    });
  });

  it("on its own run does nothing", () => {
    expect(planDrop(run(), run(), "Monday")).toEqual({ kind: "none" });
  });

  it("on another schedule's run moves the topic there, at that run's place", () => {
    expect(planDrop(run({ index: 1 }), run({ scheduleId: "s2", index: 3 }), "Tuesday")).toEqual({
      kind: "transfer",
      scheduleId: "s1",
      baseVersion: 4,
      index: 1,
      targetId: "s2",
      position: 3,
    });
    expect(
      planDrop(run({ index: 1 }), run({ scheduleId: "s2", index: null }), "Tuesday"),
    ).toMatchObject({ kind: "transfer", position: undefined });
  });

  it("on a day with no run, or of a run with no queued topic, is refused in words", () => {
    expect(planDrop(run(), undefined, "Wednesday 30 September 2026")).toEqual({
      kind: "refused",
      message:
        "No run is planned on Wednesday 30 September 2026. Drop the topic on a day that has one, or change the schedule's days under Schedules.",
    });
    expect(planDrop(run({ index: null, topicSource: "held" }), run(), "Monday")).toMatchObject({
      kind: "refused",
      message: expect.stringContaining("a topic waiting for your approval"),
    });
    expect(planDrop(run(), run({ index: null }), "Monday")).toMatchObject({ kind: "refused" });
  });
});

describe("the keyboard's neighbour", () => {
  it("is the run one place earlier or later in the same schedule", () => {
    const runs = [
      run({ index: 0 }),
      run({ index: 1, topic: "Hypatia" }),
      run({ scheduleId: "s2", index: 2 }),
    ];
    expect(neighbour(runs, runs[1] as CalendarRun, -1)?.topic).toBe("Cleopatra");
    expect(neighbour(runs, runs[1] as CalendarRun, 1)).toBeUndefined();
    expect(neighbour(runs, run({ index: null }), 1)).toBeUndefined();
  });
});

describe("a run's title", () => {
  it("is the rendered project title when the server has one, else the topic or what stands in", () => {
    expect(runTitle(run({ renderedTitle: "History: Cleopatra" }))).toBe("History: Cleopatra");
    expect(runTitle(run())).toBe("Cleopatra");
    expect(runTitle(run({ topic: null, topicSource: "held" }))).toBe(
      "A topic waiting for your approval",
    );
    expect(runTitle(run({ topic: null, topicSource: "template" }))).toBe("The template as saved");
  });
});
