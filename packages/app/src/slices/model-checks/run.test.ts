import type { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import { fixedClock } from "../../kernel/clock.fake.js";
import { openDb } from "../../kernel/db/index.js";
import { migrate } from "../../kernel/db/migrate.js";
import { readSetting } from "../settings/repo.js";
import { catalogue } from "./catalogue.fake.js";
import { baselineKey, type ModelCheckRow, type ModelKey } from "./model.js";
import { readChecks, writeListed, writeVerdict } from "./repo.js";
import {
  type CheckOutcome,
  needsConfirmation,
  type PlanInput,
  planChecks,
  runChecks,
} from "./run.js";

const clock = fixedClock("2026-10-18T10:00:00.000Z");
let db: DatabaseSync;
beforeEach(() => {
  db = openDb(":memory:");
  migrate(db, clock);
});

const key = (provider: string, family: ModelKey["family"], model: string): ModelKey => ({
  provider,
  family,
  model,
});
const offered: ModelKey[] = [
  key("openrouter", "llm", "cheap"),
  key("openrouter", "llm", "dear"),
  key("openrouter", "llm", "unpriced"),
  key("elevenlabs", "tts", "v1"),
  key("fal", "image", "flux"),
  key("fal", "image", "clip"),
  key("codex", "llm", "gpt-5"),
];
const input = (over: Partial<PlanInput> = {}): PlanInput => ({
  catalogue,
  rows: [],
  offered,
  accounts: (provider) => (provider === "elevenlabs" ? undefined : `${provider}:a`),
  chosen: new Set(),
  ...over,
});
const row = (model: ModelKey, over: Partial<ModelCheckRow>): ModelCheckRow => ({
  ...model,
  account: `${model.provider}:a`,
  listed: null,
  listedAt: null,
  verdict: null,
  verdictSource: null,
  sentence: null,
  checkedAt: null,
  cost: 0,
  firstWorksAt: null,
  noticeSeen: false,
  ...over,
});

describe("planChecks", () => {
  it("plans every model of a manual run, prices it and skips clips and keyless providers", () => {
    const plan = planChecks(input(), { trigger: "manual" });
    expect(plan.targets.map((t) => t.model)).toEqual([
      "cheap",
      "dear",
      "unpriced",
      "flux",
      "gpt-5",
    ]);
    expect(plan.totalDollars).toBeCloseTo(0.0002 + 0.0036 + 0.0005);
    expect(plan.unpriced).toBe(1);
    expect(plan.planAccounts).toEqual(["codex"]);
    expect(plan.skipped.map((s) => [s.model.model, s.reason])).toEqual([
      ["v1", "No key is saved for this provider."],
      ["clip", "Image-to-video models are listed, never checked."],
    ]);
  });

  it("narrows to one provider and the models asked for", () => {
    const plan = planChecks(input(), {
      trigger: "manual",
      provider: "openrouter",
      models: ["dear"],
    });
    expect(plan.targets.map((t) => t.model)).toEqual(["dear"]);
  });

  it("checks automatically only chosen, working and newly listed models that cost nothing much", () => {
    const rows = [
      row(key("openrouter", "llm", "cheap"), { listed: true }),
      row(key("openrouter", "llm", "dear"), { verdict: "works" }),
      row(key("codex", "llm", "gpt-5"), { listed: true, verdict: "no-access" }),
      row(key("fal", "image", "flux"), { listed: true }),
    ];
    const plan = planChecks(input({ rows, chosen: new Set(["llm:openrouter:unpriced"]) }), {
      trigger: "weekly",
    });
    expect(plan.targets.map((t) => t.model)).toEqual(["cheap"]);
    expect(plan.skipped.map((s) => s.model.model)).toEqual(["unpriced", "dear", "flux"]);
  });

  it("ignores rows learned with another key", () => {
    const rows = [
      row(key("openrouter", "llm", "cheap"), { listed: true, account: "openrouter:old" }),
    ];
    expect(planChecks(input({ rows }), { trigger: "key-added" }).targets).toEqual([]);
  });

  it("checks at most 25 models of a provider automatically, chosen ones first", () => {
    const many = Array.from({ length: 30 }, (_, n) => key("codex", "llm", `m${String(n)}`));
    const rows = many.map((model) => row(model, { listed: true }));
    const plan = planChecks(input({ rows, offered: many, chosen: new Set(["llm:codex:m29"]) }), {
      trigger: "cli-added",
    });
    expect(plan.targets).toHaveLength(25);
    expect(plan.targets[0]?.model).toBe("m29");
    expect(plan.totalDollars).toBe(0);
  });
});

describe("runChecks", () => {
  const answers =
    (by: Record<string, CheckOutcome>, asked: string[] = []) =>
    (target: ModelKey): Promise<CheckOutcome> => {
      asked.push(target.model);
      const found = by[target.model];
      return found === undefined ? Promise.reject(new Error("unexpected")) : Promise.resolve(found);
    };
  const works: CheckOutcome = {
    kind: "checked",
    verdict: "works",
    sentence: null,
    stopProvider: false,
    spent: 0.0002,
  };

  it("refuses a manual run that costs money until the estimate is confirmed", async () => {
    const plan = planChecks(input(), {
      trigger: "manual",
      provider: "openrouter",
      models: ["dear"],
    });
    const asked: string[] = [];
    const deps = { db, clock, log: { write: () => {} }, check: answers({ dear: works }, asked) };
    expect(await runChecks(deps, plan)).toEqual({
      ok: false,
      reason: "estimate",
      totalDollars: plan.totalDollars,
      unpriced: 0,
    });
    expect(await runChecks(deps, plan, { confirmedDollars: 0.001 })).toMatchObject({ ok: false });
    expect(asked).toEqual([]);
    expect(await runChecks(deps, plan, { confirmedDollars: plan.totalDollars })).toMatchObject({
      ok: true,
    });
    expect(asked).toEqual(["dear"]);
  });

  it("asks a confirmation for an unpriced model, never for a free run", () => {
    const unpriced = planChecks(input(), { trigger: "manual", models: ["unpriced"] });
    expect(needsConfirmation(unpriced, undefined)).toBe(true);
    expect(needsConfirmation(unpriced, 0)).toBe(false);
    const free = planChecks(input(), { trigger: "manual", provider: "codex" });
    expect(needsConfirmation(free, undefined)).toBe(false);
  });

  it("records each verdict and its cost, stops a provider on a rejected key, and sets the baseline", async () => {
    writeVerdict(db, {
      ...key("openrouter", "llm", "old"),
      account: "openrouter:a",
      verdict: "works",
      source: "check",
      sentence: null,
      at: "2026-10-01T00:00:00.000Z",
      cost: 0,
    });
    const plan = planChecks(input(), { trigger: "manual", provider: "openrouter" });
    const asked: string[] = [];
    const summary = await runChecks(
      {
        db,
        clock,
        log: { write: () => {} },
        check: answers(
          {
            cheap: works,
            dear: {
              kind: "checked",
              verdict: "failed",
              sentence: "Bad key.",
              stopProvider: true,
              spent: 0,
            },
          },
          asked,
        ),
      },
      plan,
      { confirmedDollars: 1 },
    );
    expect(summary).toEqual({
      ok: true,
      summary: { checked: 2, works: 1, noAccess: 0, failed: 1, skipped: 1, spent: 0.0002 },
    });
    expect(asked).toEqual(["cheap", "dear"]);
    expect(readChecks(db).map((r) => [r.model, r.verdict, r.cost, r.noticeSeen])).toEqual([
      ["cheap", "works", 0.0002, true],
      ["dear", "failed", 0, false],
      ["old", "works", 0, true],
    ]);
    expect(readSetting(db, baselineKey)).toBe("2026-10-18T10:00:00.000Z");
  });

  it("leaves models that start working after the baseline as news", async () => {
    const plan = planChecks(input(), { trigger: "manual", provider: "codex" });
    const deps = { db, clock, log: { write: () => {} }, check: answers({ "gpt-5": works }) };
    await runChecks(
      deps,
      planChecks(input(), { trigger: "manual", provider: "codex", models: [] }),
    );
    await runChecks(deps, plan);
    expect(readChecks(db)[0]).toMatchObject({ model: "gpt-5", noticeSeen: false });
  });

  it("logs a checker that throws, counts it failed and goes on", async () => {
    writeListed(db, {
      provider: "codex",
      family: "llm",
      account: "codex:a",
      at: "x",
      models: new Map([["gpt-5", true]]),
    });
    const lines: string[] = [];
    const plan = planChecks(input(), { trigger: "manual", provider: "codex" });
    const answer = await runChecks(
      { db, clock, log: { write: (_l, event) => lines.push(event) }, check: answers({}) },
      plan,
    );
    expect(answer).toMatchObject({ ok: true, summary: { failed: 1, checked: 0 } });
    expect(lines).toEqual(["model-checks.check"]);
  });

  it("counts a skipped recipe and stops when aborted", async () => {
    const plan = planChecks(input(), { trigger: "manual", provider: "codex" });
    const skipped = await runChecks(
      {
        db,
        clock,
        log: { write: () => {} },
        check: () => Promise.resolve({ kind: "skipped", reason: "no voice" }),
      },
      plan,
    );
    expect(skipped).toMatchObject({ ok: true, summary: { skipped: 1 } });
    const controller = new AbortController();
    controller.abort();
    const asked: string[] = [];
    await runChecks({ db, clock, log: { write: () => {} }, check: answers({}, asked) }, plan, {
      signal: controller.signal,
    });
    expect(asked).toEqual([]);
  });
});
