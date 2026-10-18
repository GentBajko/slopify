import { describe, expect, it } from "vitest";
import { type AutopilotSignals, warningsOf } from "./warnings.js";

const now = new Date("2026-10-18T10:00:00.000Z");
const quiet: AutopilotSignals = {
  clis: [],
  plans: [],
  openRouter: null,
  disk: { freeBytes: 200 * 1024 ** 3, totalBytes: 500 * 1024 ** 3 },
  schedules: [],
  retired: [],
};
const keys = (signals: Partial<AutopilotSignals>, snoozes = new Map<string, string>()) =>
  warningsOf({ ...quiet, ...signals }, snoozes, now).map((one) => [one.key, one.severity]);

describe("warningsOf", () => {
  it("says nothing while everything is fine", () => {
    expect(warningsOf(quiet, new Map(), now)).toEqual([]);
  });

  it("names a signed-out CLI with its sign-in command, and not one it couldn't ask", () => {
    const warnings = warningsOf(
      {
        ...quiet,
        clis: [
          { id: "codex", name: "Codex", signIn: "codex login", login: "signed-out" },
          { id: "claude-code", name: "Claude Code", signIn: "claude auth login", login: "unknown" },
        ],
      },
      new Map(),
      now,
    );
    expect(warnings).toEqual([
      {
        key: "cli-signed-out:codex",
        severity: "problem",
        text: 'Codex is signed out, so scheduled runs that use it will fail. Open a terminal on this computer, run "codex login" and sign in.',
        fix: { kind: "settings", section: "providers", label: "Open Providers" },
      },
    ]);
  });

  it("warns at 80% of a plan's weekly or 5-hour limit", () => {
    const warnings = warningsOf(
      {
        ...quiet,
        plans: [
          { name: "Claude", weeklyPercent: 85.4, fiveHourPercent: 10 },
          { name: "Codex", weeklyPercent: 20, fiveHourPercent: 90 },
          { name: "Gemini", weeklyPercent: 79, fiveHourPercent: null },
        ],
      },
      new Map(),
      now,
    );
    expect(warnings.map((one) => one.text)).toEqual([
      "Claude has used 85% of its weekly limit, so scheduled runs on it may wait until the limit resets. Check when it resets, or move a template to another provider.",
      "Codex has used 90% of its 5-hour limit, so scheduled runs on it may wait until the limit resets. Check when it resets, or move a template to another provider.",
    ]);
    expect(warnings[0]?.fix).toEqual({
      kind: "settings",
      section: "usage",
      label: "See plan usage",
    });
  });

  it("warns when the OpenRouter key's limit is nearly spent, and calls an empty one a problem", () => {
    expect(keys({ openRouter: { limit: 10, remaining: 3 } })).toEqual([]);
    expect(keys({ openRouter: { limit: 10, remaining: 1.5 } })).toEqual([
      ["openrouter-low", "warning"],
    ]);
    const empty = warningsOf(
      { ...quiet, openRouter: { limit: 10, remaining: -0.2 } },
      new Map(),
      now,
    );
    expect(empty[0]?.severity).toBe("problem");
    expect(empty[0]?.text).toContain("has $0.00 left of its $10.00 limit");
  });

  it("warns when the disk is under 10% free, and calls under 5 GB a problem", () => {
    expect(keys({ disk: { freeBytes: 40 * 1024 ** 3, totalBytes: 500 * 1024 ** 3 } })).toEqual([
      ["disk-low", "warning"],
    ]);
    const full = warningsOf(
      { ...quiet, disk: { freeBytes: 2 * 1024 ** 3, totalBytes: 10 * 1024 ** 3 } },
      new Map(),
      now,
    );
    expect(full[0]).toMatchObject({ key: "disk-low", severity: "problem" });
    expect(full[0]?.text).toContain("Only 2.0 GB is free");
    expect(keys({ disk: null })).toEqual([]);
  });

  it("warns about a queue nearly empty with nothing to refill it, and topic finding that fails", () => {
    const schedule = {
      id: "s1",
      name: "Myths",
      paused: false,
      queued: 2,
      generation: "off" as const,
      topicsError: null,
    };
    const warnings = warningsOf(
      {
        ...quiet,
        schedules: [
          schedule,
          { ...schedule, id: "s2", queued: 0 },
          { ...schedule, id: "s3", queued: 3 },
          {
            ...schedule,
            id: "s4",
            generation: "queue",
            queued: 0,
            topicsError: "The text model refused the request.",
          },
          { ...schedule, id: "s5", paused: true, queued: 1 },
        ],
      },
      new Map(),
      now,
    );
    expect(warnings.map((one) => [one.key, one.severity])).toEqual([
      ["topics-failing:s4", "problem"],
      ["few-topics:s1:2", "warning"],
    ]);
    expect(warnings[1]?.text).toBe(
      "“Myths” has 2 topics left and doesn't find new ones, so it stops after its next 2 runs. Add topics to its queue, or turn on topic generation.",
    );
    expect(warnings[0]?.fix).toEqual({
      kind: "schedule",
      scheduleId: "s4",
      label: "Open the schedule",
    });
  });

  it("points a retiring model at where it is chosen", () => {
    const warnings = warningsOf(
      {
        ...quiet,
        retired: [
          {
            kind: "template",
            id: "t1",
            name: "Weekly",
            slot: "Text model",
            model: "old-1",
            why: "retired",
            replacement: "New 2",
          },
          {
            kind: "schedule",
            id: "s1",
            name: "Myths",
            slot: "Text model",
            model: "gone",
            why: "unlisted",
            replacement: null,
          },
        ],
      },
      new Map(),
      now,
    );
    expect(warnings.map((one) => [one.text, one.fix])).toEqual([
      [
        "The text model “old-1” in template “Weekly” is being retired, so its runs will fail once it is gone. Switch it to “New 2”.",
        { kind: "templates", label: "Open Templates" },
      ],
      [
        "The text model “gone” in schedule “Myths” is no longer offered, so its runs will fail once it is gone. Switch it to another model.",
        { kind: "schedule", scheduleId: "s1", label: "Open the schedule" },
      ],
    ]);
  });

  it("keeps a hidden warning hidden until its snooze ends", () => {
    const signals = { disk: { freeBytes: 1, totalBytes: 10 } };
    expect(keys(signals, new Map([["disk-low", "2026-10-20T00:00:00.000Z"]]))).toEqual([]);
    expect(keys(signals, new Map([["disk-low", "2026-10-17T00:00:00.000Z"]]))).toEqual([
      ["disk-low", "problem"],
    ]);
  });
});
