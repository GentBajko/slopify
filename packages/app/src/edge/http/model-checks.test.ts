import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createCatalogueStore } from "../../catalog/store.js";
import { fixedClock } from "../../kernel/clock.fake.js";
import { openDb } from "../../kernel/db/index.js";
import { migrate } from "../../kernel/db/migrate.js";
import type { Ids } from "../../kernel/ids.js";
import type { Log } from "../../kernel/log.js";
import { ensureDirs, layout } from "../../kernel/paths.js";
import type { ModelKey } from "../../slices/model-checks/model.js";
import { readAuto, readChecks, writeVerdict } from "../../slices/model-checks/repo.js";
import type { CheckOutcome } from "../../slices/model-checks/run.js";
import { createModelChecks } from "../../slices/model-checks/service.js";
import { upsertKey } from "../../slices/settings/repo.js";
import { createHub } from "../events/hub.js";
import { type AppDeps, createApp } from "./app.js";

const clock = fixedClock("2026-10-18T10:00:00.000Z");
const log: Log = { write: (): void => {} };
const ids: Ids = { next: (): string => "id1" };

function harness(over: { auto?: boolean; checks?: boolean } = {}) {
  const paths = layout(mkdtempSync(join(tmpdir(), "slopify-model-checks-")));
  ensureDirs(paths, { mode: 0o700 });
  const db = openDb(paths.db);
  migrate(db, clock);
  const catalogue = createCatalogueStore({
    dataDir: paths.dataDir,
    fetch: () => Promise.reject(new Error("offline")),
  });
  const asked: ModelKey[] = [];
  const relisted: string[] = [];
  const automatic: string[] = [];
  const works: CheckOutcome = {
    kind: "checked",
    verdict: "works",
    sentence: null,
    stopProvider: false,
    spent: 0,
  };
  const service = createModelChecks({
    db,
    clock,
    log,
    catalogue: () => catalogue.read(),
    check: async (target) => {
      asked.push(target);
      return works;
    },
    listing: {
      refresh: async (provider) => {
        relisted.push(provider);
        return undefined;
      },
    },
    providerModels: async () => [{ id: "gpt-5", name: "GPT-5" }],
  });
  const modelChecks: NonNullable<AppDeps["modelChecks"]> = {
    ...service,
    automatic: async (trigger, provider) => {
      automatic.push(`${trigger}:${provider ?? ""}`);
    },
  };
  const app = createApp({
    db,
    paths,
    hub: createHub({ ids, log }),
    runner: {
      tick: (): void => {},
      settled: async (): Promise<void> => {},
      abortProject: async (): Promise<void> => {},
      abortAll: async (): Promise<void> => {},
    },
    clock,
    ids,
    log,
    version: "1.2.3",
    webDist: join(paths.dataDir, "missing"),
    flushSoon: (): void => {},
    probe: () => Promise.resolve({ ran: false, stdout: "" }),
    catalogue,
    ...(over.checks === false
      ? {}
      : { modelChecks, modelListing: { refresh: async (p) => void relisted.push(p) } }),
    autoModelChecks: over.auto ?? false,
  });
  return { app, db, asked, relisted, automatic, catalogue };
}

const json = (method: string, body: unknown) => ({
  method,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

describe("model check routes", () => {
  it("adds standings to a provider's model list without changing the models", async () => {
    const h = harness();
    upsertKey(h.db, "openrouter", "placeholder", "2026-10-18");
    const before = (await (await h.app.request("/api/providers/openrouter/models")).json()) as {
      models: { id: string }[];
      standings: Record<string, { standing: string }>;
    };
    const first = before.models[0]?.id ?? "";
    expect(before.standings[first]?.standing).toBe("known");
    const account = (
      h.db.prepare("SELECT credential_generation AS g FROM provider_keys").get() as { g: string }
    ).g;
    writeVerdict(h.db, {
      provider: "openrouter",
      family: "llm",
      model: first,
      account: `openrouter:${account}`,
      verdict: "no-access",
      source: "run",
      sentence: "No.",
      at: clock.now().toISOString(),
      cost: 0,
    });
    const after = (await (
      await h.app.request("/api/providers/openrouter/models")
    ).json()) as typeof before;
    expect(after.models).toEqual(before.models);
    expect(after.standings[first]).toMatchObject({ standing: "no-access", sentence: "No." });
  });

  it("reads the key's list again on a picker's load and checks a saved key, only when automatic", async () => {
    const off = harness();
    await off.app.request("/api/providers/openrouter/models");
    await off.app.request("/api/providers/openrouter/key", json("PUT", { key: "placeholder" }));
    expect(off.relisted).toEqual([]);
    expect(off.automatic).toEqual([]);
    const on = harness({ auto: true });
    await on.app.request("/api/providers/openrouter/models");
    await on.app.request("/api/providers/openrouter/key", json("PUT", { key: "placeholder" }));
    expect(on.relisted).toEqual(["openrouter"]);
    expect(on.automatic).toEqual(["key-added:openrouter"]);
  });

  it("estimates, refuses an unconfirmed paid check with the estimate, then starts it", async () => {
    const h = harness();
    upsertKey(h.db, "openrouter", "placeholder", "2026-10-18");
    const first = h.catalogue.models("openrouter", "llm")[0]?.id ?? "";
    const estimate = (await (
      await h.app.request(
        `/api/providers/openrouter/models/check/estimate?models=${encodeURIComponent(first)}`,
      )
    ).json()) as { count: number; totalDollars: number; text: string };
    expect(estimate.count).toBe(1);
    expect(estimate.totalDollars).toBeGreaterThan(0);
    const refused = await h.app.request(
      "/api/providers/openrouter/models/check",
      json("POST", { models: [first] }),
    );
    expect(refused.status).toBe(409);
    const problem = (await refused.json()) as { detail: string; estimate: { count: number } };
    expect(problem.detail).toContain("confirm the estimate");
    expect(problem.detail).toContain("Settings → Models");
    expect(problem.estimate.count).toBe(1);
    expect(h.asked).toEqual([]);
    const started = await h.app.request(
      "/api/providers/openrouter/models/check",
      json("POST", { models: [first], confirmedDollars: estimate.totalDollars }),
    );
    expect(started.status).toBe(202);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(h.asked.map((t) => t.model)).toEqual([first]);
    expect(readChecks(h.db)).toHaveLength(1);
  });

  it("starts a free CLI check without asking for an estimate", async () => {
    const h = harness();
    const started = await h.app.request("/api/providers/codex/models/check", json("POST", {}));
    expect(started.status).toBe(202);
    expect(await started.json()).toMatchObject({ started: true, count: 1, text: "free" });
  });

  it("says plainly that a provider without a key can't be checked, and where to fix it", async () => {
    const h = harness();
    for (const response of [
      await h.app.request("/api/providers/openai-image/models/check/estimate"),
      await h.app.request("/api/providers/openai-image/models/check", json("POST", {})),
    ]) {
      expect(response.status).toBe(400);
      const body = (await response.json()) as { detail: string };
      expect(body.detail).toContain("No OpenAI key is saved");
      expect(body.detail).toContain("Settings → Providers → OpenAI");
    }
  });

  it("answers that checks are still starting without the service", async () => {
    const h = harness({ checks: false });
    expect((await h.app.request("/api/model-checks")).status).toBe(503);
    expect(
      (await h.app.request("/api/providers/codex/models/check", json("POST", {}))).status,
    ).toBe(503);
  });

  it("shows the overview, dismisses New for you notices and sets automatic checks", async () => {
    const h = harness();
    writeVerdict(h.db, {
      provider: "codex",
      family: "llm",
      model: "gpt-5",
      account: "codex",
      verdict: "works",
      source: "check",
      sentence: null,
      at: clock.now().toISOString(),
      cost: 0,
    });
    const overview = (await (await h.app.request("/api/model-checks")).json()) as {
      auto: string;
      newForYou: { model: string }[];
    };
    expect(overview).toMatchObject({ auto: "free", newForYou: [{ model: "gpt-5" }] });
    const dismissed = await h.app.request(
      "/api/model-checks/notices/dismiss",
      json("POST", { keys: [{ provider: "codex", family: "llm", model: "gpt-5" }] }),
    );
    expect(dismissed.status).toBe(204);
    expect(
      ((await (await h.app.request("/api/model-checks")).json()) as typeof overview).newForYou,
    ).toEqual([]);
    const set = await h.app.request("/api/model-checks/auto", json("PUT", { auto: "off" }));
    expect(await set.json()).toEqual({ auto: "off" });
    expect(readAuto(h.db)).toBe("off");
    expect(
      (await h.app.request("/api/model-checks/auto", json("PUT", { auto: "always" }))).status,
    ).toBe(400);
  });
});
