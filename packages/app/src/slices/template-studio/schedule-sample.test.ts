import { describe, expect, it } from "vitest";
import { draftFixture } from "../play-drafts/draft.fake.js";
import type { PlayDraftDocument } from "../play-drafts/schema.js";
import type { ScheduleSummary } from "../schedules/schema.js";
import { reviewsPath } from "./reviews-path.js";
import { monthlyCost, runsPerMonth, upcomingRuns } from "./schedule-sample.js";

const fixture = draftFixture();
const document: PlayDraftDocument = {
  ...fixture.document,
  form: { ...fixture.document.form, title: "History: {{Topic}}" },
};
fixture.close();
const now = new Date("2026-10-18T10:00:00.000Z");

function schedule(overrides: Partial<ScheduleSummary>): ScheduleSummary {
  return {
    id: "s1",
    name: "Weekdays",
    templateKind: "project",
    templateId: "t1",
    templateVersion: 1,
    cadence: { kind: "weekly", time: "20:00", days: [1, 3] },
    timezone: "UTC",
    missedPolicy: "skip",
    overlapPolicy: "skip",
    spendLimitCents: null,
    items: [
      { title: "Salt roads", values: {} },
      { title: "Tea clippers", values: {} },
    ],
    topicKeyword: "Topic",
    values: {},
    brief: null,
    topicGeneration: { mode: "off", keepAtLeast: 10, llm: null },
    releases: [],
    topicScoring: "off",
    topics: { held: 0, generatingSince: null, generatedAt: null, failedAt: null, error: null },
    status: "active",
    version: 1,
    nextRunAt: null,
    createdAt: "a",
    updatedAt: "a",
    deletedAt: null,
    ...overrides,
  };
}

describe("upcomingRuns", () => {
  it("lists the next five runs across schedules, each with the title its topic fills", () => {
    const runs = upcomingRuns(
      [
        schedule({}),
        schedule({
          id: "s2",
          name: "Sundays",
          cadence: { kind: "weekly", time: "09:00", days: [0] },
          items: [],
        }),
      ],
      document,
      now,
    );
    expect(runs.map((run) => [run.at, run.scheduleName, run.title, run.topic])).toEqual([
      ["2026-10-19T20:00:00.000Z", "Weekdays", "History: Salt roads", true],
      ["2026-10-21T20:00:00.000Z", "Weekdays", "History: Tea clippers", true],
      ["2026-10-25T09:00:00.000Z", "Sundays", "History: {{Topic}}", false],
      ["2026-10-26T20:00:00.000Z", "Weekdays", "History: {{Topic}}", false],
      ["2026-10-28T20:00:00.000Z", "Weekdays", "History: {{Topic}}", false],
    ]);
  });

  it("leaves out paused schedules and a one-off already past", () => {
    expect(
      upcomingRuns(
        [
          schedule({ status: "paused" }),
          schedule({ id: "s3", cadence: { kind: "once", at: "2026-10-01T10:00:00.000Z" } }),
        ],
        document,
        now,
      ),
    ).toEqual([]);
  });
});

describe("monthlyCost", () => {
  it("is null when nothing runs the template", () => {
    expect(monthlyCost([], new Map(), now)).toBeNull();
  });

  it("adds each schedule's runs a month at its high estimate", () => {
    const cost = monthlyCost(
      [schedule({}), schedule({ id: "s2", cadence: { kind: "daily", time: "08:00" } })],
      new Map([
        ["s1", { high: 0.5, unknown: 0 }],
        ["s2", { high: 0.1, unknown: 0 }],
      ]),
      now,
    );
    expect(cost).toEqual({ runs: 39.1, high: 7.39, unknown: 0, problem: null });
    expect(runsPerMonth(schedule({}), now)).toBeCloseTo(8.7, 1);
  });

  it("counts a run it couldn't price as unknown, saying why", () => {
    const cost = monthlyCost(
      [schedule({})],
      new Map([["s1", "No voice is chosen. Choose a voice."]]),
      now,
    );
    expect(cost).toEqual({
      runs: 8.7,
      high: 0,
      unknown: 1,
      problem:
        "The runs of Weekdays couldn't be priced: No voice is chosen. Choose a voice. Fix it in this studio, press Save, then Make samples.",
    });
    expect(monthlyCost([schedule({})], new Map(), now)?.problem).toBe(
      "The cost of the runs of Weekdays isn't worked out yet: it is, with the free samples.",
    );
  });

  it("counts a one-off run only when it falls within the month", () => {
    const soon = schedule({ cadence: { kind: "once", at: "2026-10-30T10:00:00.000Z" } });
    const later = schedule({ cadence: { kind: "once", at: "2026-12-30T10:00:00.000Z" } });
    expect(runsPerMonth(soon, now)).toBe(1);
    expect(runsPerMonth(later, now)).toBe(0);
  });
});

describe("reviewsPath", () => {
  it("lists where a run stops and who answers, in run order", () => {
    const path = reviewsPath({
      ...document,
      form: {
        ...document.form,
        checkpoints: ["video", "audio"],
        reviews: {
          provider: "openrouter",
          model: "m",
          retries: "1",
          stages: {
            thumbnail: { mode: "flag", prompt: "" },
            article: { mode: "redo", prompt: "" },
            images: { mode: "off", prompt: "" },
          },
        },
      },
    });
    expect(path.map((step) => [step.name, step.kind, step.by])).toEqual([
      ["Script", "review", "model"],
      ["Before the narration", "checkpoint", "you"],
      ["Thumbnail", "review", "model"],
      ["Before the video", "checkpoint", "you"],
    ]);
    expect(path[0]?.detail).toBe("The reviewer model checks it; a failed item is made again.");
  });

  it("says an agent answers when the reviewer is an agent, and is empty with nothing on", () => {
    const agent = reviewsPath({
      ...document,
      form: {
        ...document.form,
        reviews: {
          provider: "",
          model: "",
          reviewer: "agent",
          retries: "1",
          stages: { images: { mode: "flag", prompt: "" } },
        },
      },
    });
    expect(agent).toEqual([
      {
        id: "review:images",
        name: "Pictures",
        kind: "review",
        by: "agent",
        detail: "Your agent answers this; a failed item is flagged for you.",
      },
    ]);
    expect(reviewsPath(document)).toEqual([]);
  });
});
