import type { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import type { Clock } from "../../kernel/clock.js";
import { openDb } from "../../kernel/db/index.js";
import { migrate } from "../../kernel/db/migrate.js";
import { upsertKey, writeSetting } from "../settings/repo.js";
import { catalogue } from "./catalogue.fake.js";
import { autoKey, type ModelKey, weeklyAtKey } from "./model.js";
import { readChecks, writeListed } from "./repo.js";
import type { CheckOutcome } from "./run.js";
import { createModelChecks, type ModelChecksDeps } from "./service.js";

let db: DatabaseSync;
let now: number;
const clock: Clock = { now: () => new Date(now), sleep: () => Promise.resolve() };
beforeEach(() => {
  now = Date.parse("2026-10-18T10:00:00.000Z");
  db = openDb(":memory:");
  migrate(db, clock);
});

function setup(over: Partial<ModelChecksDeps> = {}) {
  const asked: string[] = [];
  const refreshed: string[] = [];
  let release: (() => void) | undefined;
  const works: CheckOutcome = {
    kind: "checked",
    verdict: "works",
    sentence: null,
    stopProvider: false,
    spent: 0.0002,
  };
  const deps: ModelChecksDeps = {
    db,
    clock,
    log: { write: () => {} },
    catalogue: () => catalogue,
    check: async (target: ModelKey) => {
      asked.push(target.model);
      if (target.model === "slow") await new Promise<void>((resolve) => (release = resolve));
      return works;
    },
    listing: {
      refresh: async (provider) => {
        refreshed.push(provider);
        return undefined;
      },
    },
    providerModels: async (provider) =>
      provider === "codex"
        ? [
            { id: "gpt-5", name: "GPT-5" },
            { id: "slow", name: "Slow" },
          ]
        : [],
    ...over,
  };
  return { checks: createModelChecks(deps), asked, refreshed, release: () => release?.() };
}

describe("model checks service", () => {
  it("offers the catalogue for a keyed provider and the CLI's own list for a CLI", async () => {
    const { checks } = setup();
    expect((await checks.offered("fal")).map((m) => m.model)).toEqual(["flux", "clip"]);
    expect((await checks.offered("codex")).map((m) => m.model)).toEqual(["gpt-5", "slow"]);
  });

  it("estimates a CLI's named models without asking the CLI for its list", async () => {
    let listed = 0;
    const { checks } = setup({
      providerModels: async () => {
        listed += 1;
        return [];
      },
    });
    const plan = await checks.plan({ trigger: "manual", provider: "codex", models: ["gpt-5"] });
    expect(plan.targets.map((t) => t.model)).toEqual(["gpt-5"]);
    expect(listed).toBe(0);
  });

  it("asks for the estimate before a paid manual run, then runs it in the background", async () => {
    upsertKey(db, "openrouter", "placeholder", "2026-10-18");
    const { checks, asked } = setup();
    const refused = await checks.start({ trigger: "manual", provider: "openrouter" });
    expect(refused).toMatchObject({ ok: false, reason: "estimate" });
    expect(asked).toEqual([]);
    const plan = refused.ok === false && refused.reason === "estimate" ? refused.plan : undefined;
    const started = await checks.start(
      { trigger: "manual", provider: "openrouter" },
      plan?.totalDollars,
    );
    expect(started.ok).toBe(true);
    if (started.ok) expect(await started.done).toMatchObject({ checked: 3, works: 3 });
    expect(readChecks(db)).toHaveLength(3);
  });

  it("runs one check of a provider when two starts arrive together", async () => {
    upsertKey(db, "openrouter", "placeholder", "2026-10-18");
    const { checks, asked } = setup();
    const refused = await checks.start({ trigger: "manual", provider: "openrouter" });
    const dollars =
      refused.ok === false && refused.reason === "estimate" ? refused.plan.totalDollars : 0;
    expect(checks.running()).toEqual([]);
    const both = await Promise.all([
      checks.start({ trigger: "manual", provider: "openrouter" }, dollars),
      checks.start({ trigger: "manual", provider: "openrouter" }, dollars),
      checks.automatic("key-added", "openrouter"),
    ]);
    expect(both.slice(0, 2).map((answer) => answer?.ok)).toEqual([true, false]);
    expect(both[1]).toMatchObject({ reason: "running", providers: ["openrouter"] });
    const [first] = both;
    if (first?.ok) await first.done;
    expect(asked).toHaveLength(3);
    expect(checks.running()).toEqual([]);
  });

  it("frees a provider when its start stops at the estimate or fails to plan", async () => {
    upsertKey(db, "openrouter", "placeholder", "2026-10-18");
    let fail = false;
    const { checks } = setup({
      catalogue: () => {
        if (fail) throw new Error("catalogue unreadable");
        return catalogue;
      },
    });
    expect(await checks.start({ trigger: "manual", provider: "openrouter" })).toMatchObject({
      reason: "estimate",
    });
    expect(checks.running()).toEqual([]);
    fail = true;
    await expect(checks.start({ trigger: "manual", provider: "openrouter" })).rejects.toThrow();
    expect(checks.running()).toEqual([]);
  });

  it("runs one check of a provider at a time", async () => {
    const { checks, release } = setup();
    const first = await checks.start({ trigger: "manual", provider: "codex" });
    expect(checks.running()).toEqual(["codex"]);
    expect(await checks.start({ trigger: "manual", provider: "codex" })).toEqual({
      ok: false,
      reason: "running",
      providers: ["codex"],
    });
    expect(checks.overview().providers.find((p) => p.provider === "codex")?.running).toBe(true);
    release();
    if (first.ok) await first.done;
    expect(checks.running()).toEqual([]);
  });

  it("lists, then checks only what is free, when a CLI is added; nothing more with checks off", async () => {
    writeListed(db, {
      provider: "codex",
      family: "llm",
      account: "codex",
      at: "x",
      models: new Map([["gpt-5", true]]),
    });
    const { checks, asked, refreshed } = setup();
    await checks.automatic("cli-added", "codex");
    expect(refreshed).toEqual(["codex"]);
    expect(asked).toEqual(["gpt-5"]);
    writeSetting(db, autoKey, "off");
    await checks.automatic("cli-added", "codex");
    expect(refreshed).toEqual(["codex", "codex"]);
    expect(asked).toEqual(["gpt-5"]);
  });

  it("is due weekly unless checks are off, and records the weekly look", async () => {
    const { checks } = setup();
    expect(checks.weeklyDue()).toBe(true);
    await checks.automatic("weekly");
    expect(checks.weeklyDue()).toBe(false);
    now += 7 * 24 * 60 * 60_000;
    expect(checks.weeklyDue()).toBe(true);
    writeSetting(db, autoKey, "off");
    expect(checks.weeklyDue()).toBe(false);
    writeSetting(db, weeklyAtKey, "2026-10-18T10:00:00.000Z");
  });

  it("gives each model of a provider its standing for this account, with a retirement", () => {
    writeListed(db, {
      provider: "codex",
      family: "llm",
      account: "codex",
      at: "x",
      models: new Map([["gpt-5", true]]),
    });
    const { checks } = setup({
      retiring: (model) =>
        model.model === "old" ? { on: "2026-11-30", replacement: null } : undefined,
    });
    expect(
      checks.standings("codex", [
        { id: "gpt-5", name: "GPT-5" },
        { id: "old", name: "Old" },
      ]),
    ).toEqual({
      "gpt-5": { standing: "listed", checkedAt: null, sentence: null, source: null },
      old: {
        standing: "known",
        checkedAt: null,
        sentence: null,
        source: null,
        retiring: { on: "2026-11-30", replacement: null },
      },
    });
  });

  it("shows what started working since the baseline under New for you, with names", async () => {
    const { checks } = setup();
    const baseline = await checks.start({ trigger: "manual", provider: "codex", models: [] });
    if (baseline.ok) await baseline.done;
    const next = await checks.start({ trigger: "manual", provider: "codex", models: ["gpt-5"] });
    if (next.ok) await next.done;
    expect(checks.overview().newForYou).toEqual([
      {
        provider: "codex",
        family: "llm",
        model: "gpt-5",
        name: "gpt-5",
        firstWorksAt: "2026-10-18T10:00:00.000Z",
      },
    ]);
    const state = checks.overview().providers.find((p) => p.provider === "codex");
    expect(state).toMatchObject({ works: 1, lastCheckedAt: "2026-10-18T10:00:00.000Z" });
    expect(checks.overview().auto).toBe("free");
  });
});
