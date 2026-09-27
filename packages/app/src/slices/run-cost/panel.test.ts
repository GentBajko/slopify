import type { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import type { Catalogue } from "../../catalog/schema.js";
import { fixedClock } from "../../kernel/clock.fake.js";
import { openDb } from "../../kernel/db/index.js";
import { migrate } from "../../kernel/db/migrate.js";
import { ulidIds } from "../../kernel/ids.js";
import { createUsageMeter } from "./meter.js";
import { runCostOf, windowUse } from "./panel.js";

const open: DatabaseSync[] = [];
afterEach(() => {
  for (const db of open.splice(0)) db.close();
});

const base = {
  enabled: true,
  deprecated: false,
  source: "https://example.com",
  keywords: [],
};
const catalogue: Catalogue = {
  schemaVersion: 1,
  updatedAt: "2026-09-26",
  providers: {},
  llm: [
    {
      ...base,
      provider: "openrouter",
      id: "openai/gpt-5.6-sol",
      name: "GPT-5.6 Sol",
      pricing: { inputPerMillionTokens: 2, outputPerMillionTokens: 10 },
      llm: { webSearch: false },
    },
  ],
  tts: [
    {
      ...base,
      provider: "elevenlabs",
      id: "eleven_v3",
      name: "Eleven v3",
      pricing: { perMillionCharacters: 100 },
      tts: { maxCharacters: 5000, streaming: true },
    },
  ],
  image: [],
};

function database(): DatabaseSync {
  const db = openDb(":memory:");
  open.push(db);
  migrate(db, fixedClock("2026-09-27T10:00:00.000Z"));
  db.exec("INSERT INTO projects VALUES ('p1','Run','16:9','{}','2026-09-27','2026-09-27')");
  db.exec(
    `INSERT INTO stages (id, project_id, kind, source, state, started_at, finished_at) VALUES
     ('s1','p1','article','generate','done','2026-09-27T10:00:00.000Z','2026-09-27T10:02:00.000Z'),
     ('s2','p1','audio','generate','done','2026-09-27T10:02:00.000Z','2026-09-27T10:05:00.000Z'),
     ('s3','p1','video','generate','done','2026-09-27T10:05:00.000Z','2026-09-27T10:06:00.000Z')`,
  );
  return db;
}

describe("the Run cost tab", () => {
  it("adds up cost, API equivalent, usage and time per stage and per model", () => {
    const db = database();
    const meter = createUsageMeter({
      db,
      ids: ulidIds,
      clock: fixedClock("2026-09-27T10:01:00.000Z"),
      catalogue: () => catalogue,
    });
    // Two Codex calls on the plan, with the plan's weekly window read around each.
    meter.record({
      projectId: "p1",
      stage: "article",
      kind: "llm",
      provider: "codex",
      model: "gpt-5.6-sol",
      tokensIn: 100_000,
      tokensOut: 10_000,
      cachedTokens: 50_000,
      wallMs: 30_000,
      limits: {
        before: [{ kind: "weekly", usedPercent: 10, resetsAt: "2026-10-01T00:00:00.000Z" }],
        after: [{ kind: "weekly", usedPercent: 12, resetsAt: "2026-10-01T00:00:00.000Z" }],
      },
    });
    meter.record({
      projectId: "p1",
      stage: "article",
      kind: "llm",
      provider: "codex",
      model: "gpt-5.6-sol",
      tokensIn: 100_000,
      tokensOut: 10_000,
      wallMs: 30_000,
      limits: {
        before: [{ kind: "weekly", usedPercent: 12, resetsAt: "2026-10-01T00:00:00.000Z" }],
        after: [{ kind: "weekly", usedPercent: 15, resetsAt: "2026-10-01T00:00:00.000Z" }],
      },
    });
    // Keyed narration, and a Claude call that reported no windows.
    meter.record({
      projectId: "p1",
      stage: "audio",
      kind: "tts",
      provider: "elevenlabs",
      model: "eleven_v3",
      characters: 20_000,
      wallMs: 60_000,
    });
    meter.record({
      projectId: "p1",
      stage: "audio",
      kind: "llm",
      provider: "claude-code",
      model: "claude-unknown",
      tokensIn: 1000,
      tokensOut: 100,
      wallMs: 5000,
    });

    const cost = runCostOf(db, "p1");
    expect(cost.cost).toBeCloseTo(2);
    expect(cost.unpriced).toBe(0);
    // 200k in and 20k out at $2/$10 per million, twice over the same tokens: 0.4 + 0.2.
    expect(cost.apiEquivalent).toBeCloseTo(0.6);
    expect(cost.apiUnpriced).toBe(1);
    expect(cost.totals).toEqual({
      tokensIn: 201_000,
      tokensOut: 20_100,
      cachedTokens: 50_000,
      characters: 20_000,
      images: 0,
      seconds: 0,
      wallMs: 6 * 60_000,
    });
    expect(cost.byStage.map((row) => [row.stage, row.calls, row.wallMs])).toEqual([
      ["article", 2, 120_000],
      ["audio", 2, 180_000],
      ["video", 0, 60_000],
    ]);
    expect(cost.byModel[0]).toMatchObject({ provider: "elevenlabs", cost: 2, onPlan: false });
    expect(cost.byModel.find((row) => row.provider === "codex")).toMatchObject({
      onPlan: true,
      calls: 2,
      cost: 0,
      apiModel: "openai/gpt-5.6-sol",
      tokensIn: 200_000,
    });
    expect(cost.plans).toEqual([
      {
        account: "claude-code",
        name: "Claude",
        calls: 1,
        reported: false,
        windows: [],
      },
      {
        account: "codex",
        name: "Codex",
        calls: 2,
        reported: true,
        windows: [
          {
            kind: "weekly",
            usedPercent: 5,
            nowPercent: 15,
            resetsAt: "2026-10-01T00:00:00.000Z",
          },
        ],
      },
    ]);
    expect(cost.catalogueDate).toBe("2026-09-26");
    expect(cost.waits).toEqual([]);
  });

  it("answers an empty tab for a project that made no calls", () => {
    const db = database();
    const cost = runCostOf(db, "p1");
    expect(cost).toMatchObject({ calls: 0, cost: 0, apiEquivalent: null, byModel: [], plans: [] });
  });
});

describe("windowUse", () => {
  it("counts usage since a window rolled over rather than going negative", () => {
    expect(
      windowUse([
        [{ kind: "five_hour", usedPercent: 90, resetsAt: "2026-09-27T12:00:00.000Z" }],
        [{ kind: "five_hour", usedPercent: 96, resetsAt: "2026-09-27T12:00:00.000Z" }],
        // The window reset between these two readings.
        [{ kind: "five_hour", usedPercent: 4, resetsAt: "2026-09-27T17:00:00.000Z" }],
      ]),
    ).toEqual([
      { kind: "five_hour", usedPercent: 10, nowPercent: 4, resetsAt: "2026-09-27T17:00:00.000Z" },
    ]);
  });
});
