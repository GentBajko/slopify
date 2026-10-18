import type { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import { fixedClock } from "../../kernel/clock.fake.js";
import { openDb } from "../../kernel/db/index.js";
import { migrate } from "../../kernel/db/migrate.js";
import { upsertKey, writeSetting } from "../settings/repo.js";
import { autoKey } from "./model.js";
import {
  accountOf,
  markNoticesSeen,
  readAuto,
  readChecks,
  writeAuto,
  writeListed,
  writeVerdict,
} from "./repo.js";

let db: DatabaseSync;
beforeEach(() => {
  db = openDb(":memory:");
  migrate(db, fixedClock("2026-10-18T10:00:00.000Z"));
});

const key = { provider: "openrouter", family: "llm", model: "m1" } as const;
const verdict = (over: Partial<Parameters<typeof writeVerdict>[1]> = {}) =>
  writeVerdict(db, {
    ...key,
    account: "a1",
    verdict: "works",
    source: "check",
    sentence: null,
    at: "2026-10-18T10:00:00.000Z",
    cost: 0.0001,
    ...over,
  });

describe("model_checks repo", () => {
  it("writes a verdict, counts its cost and remembers when it first worked", () => {
    const stored = verdict();
    expect(stored).toMatchObject({
      verdict: "works",
      verdictSource: "check",
      cost: 0.0001,
      firstWorksAt: "2026-10-18T10:00:00.000Z",
      noticeSeen: false,
    });
    const again = verdict({ at: "2026-10-19T10:00:00.000Z", cost: 0.0002 });
    expect(again.cost).toBeCloseTo(0.0003);
    expect(again.firstWorksAt).toBe("2026-10-18T10:00:00.000Z");
  });

  it("keeps the earlier verdict when a later check failed", () => {
    verdict();
    const failed = verdict({
      verdict: "failed",
      sentence: "Busy.",
      at: "2026-10-19T00:00:00.000Z",
    });
    expect(failed.verdict).toBe("works");
  });

  it("marks a model a run used as already seen", () => {
    expect(verdict({ source: "run" }).noticeSeen).toBe(true);
  });

  it("starts a row over for another account", () => {
    verdict({ verdict: "no-access", sentence: "No." });
    writeListed(db, {
      provider: "openrouter",
      family: "llm",
      account: "a2",
      at: "2026-10-18T11:00:00.000Z",
      models: new Map([
        ["m1", true],
        ["m2", false],
      ]),
    });
    const rows = readChecks(db, "openrouter");
    expect(rows.map((r) => [r.model, r.account, r.listed, r.verdict, r.cost])).toEqual([
      ["m1", "a2", true, null, 0],
      ["m2", "a2", false, null, 0],
    ]);
    expect(readChecks(db)).toHaveLength(2);
  });

  it("keeps a verdict when the same account's listing is refreshed", () => {
    verdict();
    writeListed(db, {
      provider: "openrouter",
      family: "llm",
      account: "a1",
      at: "2026-10-18T11:00:00.000Z",
      models: new Map([["m1", false]]),
    });
    expect(readChecks(db)[0]).toMatchObject({ listed: false, verdict: "works" });
  });

  it("marks notices seen, one by one or all", () => {
    verdict();
    verdict({ model: "m2" });
    markNoticesSeen(db, [key]);
    expect(readChecks(db).map((r) => r.noticeSeen)).toEqual([true, false]);
    markNoticesSeen(db, "all");
    expect(readChecks(db).map((r) => r.noticeSeen)).toEqual([true, true]);
  });

  it("names the account: key generation, shared key, CLI id, none", () => {
    expect(accountOf(db, "openrouter")).toBeUndefined();
    upsertKey(db, "openrouter", "placeholder", "2026-10-18");
    const first = accountOf(db, "openrouter");
    expect(first).toMatch(/^openrouter:/);
    upsertKey(db, "openrouter", "placeholder-2", "2026-10-18");
    expect(accountOf(db, "openrouter")).not.toBe(first);
    expect(accountOf(db, "google-tts")).toBeUndefined();
    upsertKey(db, "google-image", "placeholder", "2026-10-18");
    expect(accountOf(db, "google-tts")).toMatch(/^google-image:/);
    expect(accountOf(db, "codex")).toBe("codex");
    expect(accountOf(db, "system-voice")).toBe("system-voice");
  });

  it("reads the automatic-check setting, free unless turned off", () => {
    expect(readAuto(db)).toBe("free");
    writeAuto(db, "off");
    expect(readAuto(db)).toBe("off");
    writeSetting(db, autoKey, "nonsense");
    expect(readAuto(db)).toBe("free");
  });
});
