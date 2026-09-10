import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { fixedClock } from "../../kernel/clock.fake.js";
import { openDb } from "../../kernel/db/index.js";
import { migrate } from "../../kernel/db/migrate.js";
import { layout } from "../../kernel/paths.js";
import { createUpdater } from "../../updater/service.js";
import { createHub } from "../events/hub.js";
import { createApp } from "./app.js";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});
async function harness(candidate = false) {
  const paths = layout(await mkdtemp(join(tmpdir(), "slopify-update-http-")));
  const db = openDb(paths.db);
  const clock = fixedClock("2026-09-10T10:00:00.000Z");
  migrate(db, clock);
  const ids = { next: (): string => "id1" };
  const log = { write: (): void => {} };
  let calls = 0;
  let busy = false;
  let committed = false;
  const versions: string[] = [];
  const updater = createUpdater({
    ...(candidate
      ? { candidate: { token: "a".repeat(64), pending: true, committed: async () => committed } }
      : {}),
    currentVersion: "0.6.1",
    latest: async () => {
      calls++;
      return "0.6.2";
    },
    now: () => 0,
    busy: () => busy,
    unsupported: () => undefined,
    report: () => {},
    install: async (version) => {
      versions.push(version);
    },
  });
  const app = createApp({
    db,
    paths,
    clock,
    ids,
    log,
    updater,
    hub: createHub({ ids, log }),
    runner: {
      tick: () => {},
      settled: async () => {},
      abortProject: async () => {},
      abortAll: async () => {},
    },
    version: "0.6.1",
    webDist: join(paths.dataDir, "missing"),
    flushSoon: () => {},
    probe: async () => ({ ran: false, stdout: "" }),
  });
  cleanups.push(async () => {
    db.close();
    await rm(paths.dataDir, { recursive: true, force: true });
  });
  return {
    app,
    updater,
    versions,
    commit: () => {
      committed = true;
    },
    calls: () => calls,
    busy: () => {
      busy = true;
    },
  };
}
describe("update HTTP API", () => {
  it("checks without installation, disables browser caches, and supports an explicit refresh", async () => {
    const h = await harness();
    const response = await h.app.request("/api/update");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({
      currentVersion: "0.6.1",
      latestVersion: "0.6.2",
      canUpdate: true,
    });
    await h.app.request("/api/update");
    expect(h.calls()).toBe(1);
    await h.app.request("/api/update?refresh=1");
    expect(h.calls()).toBe(2);
    expect(h.versions).toEqual([]);
  });
  it("installs only the registry version after an explicit click and blocks subsequent writes", async () => {
    const h = await harness();
    const response = await h.app.request("/api/update", {
      method: "POST",
      body: JSON.stringify({ version: "99.0.0;bad" }),
    });
    expect(response.status).toBe(202);
    expect(h.versions).toEqual(["0.6.2"]);
    expect((await h.app.request("/api/settings", { method: "PATCH" })).status).toBe(409);
    expect((await h.app.request("/api/health")).status).toBe(200);
    expect((await h.app.request("/api/update", { method: "POST" })).status).toBe(409);
  });
  it("rejects active work and does not install", async () => {
    const h = await harness();
    h.busy();
    expect((await h.app.request("/api/update")).status).toBe(200);
    expect(await (await h.app.request("/api/update")).json()).toMatchObject({
      canUpdate: false,
      busy: true,
    });
    expect((await h.app.request("/api/update", { method: "POST" })).status).toBe(409);
    expect(h.versions).toEqual([]);
  });
  it("rejects cross-origin form submissions before checking or installing", async () => {
    const h = await harness();
    const response = await h.app.request("http://localhost/api/update", {
      method: "POST",
      headers: { Origin: "https://other.example" },
    });
    expect(response.status).toBe(403);
    expect(h.calls()).toBe(0);
    expect(h.versions).toEqual([]);
  });
  it("releases the mutation count when an ordinary request is rejected", async () => {
    const h = await harness();
    await h.app.request("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    expect((await h.updater.check()).busy).toBe(false);
    expect((await h.app.request("/api/update", { method: "POST" })).status).toBe(202);
  });
  it("serves health while refusing mutations until the private candidate is committed and unlocked", async () => {
    const h = await harness(true);
    const token = { "X-Slopify-Update-Token": "a".repeat(64) };
    expect((await h.app.request("/api/health")).headers.get("X-Slopify-Version")).toBeNull();
    expect((await h.app.request("/api/health")).status).toBe(200);
    expect((await h.app.request("/api/update/ready")).status).toBe(403);
    expect((await h.app.request("/api/update/ready", { headers: token })).status).toBe(200);
    expect((await h.app.request("/api/settings", { method: "PATCH" })).status).toBe(409);
    expect(
      (await h.app.request("/api/update/activate", { method: "POST", headers: token })).status,
    ).toBe(409);
    h.commit();
    expect((await h.app.request("/api/update/activate", { method: "POST" })).status).toBe(403);
    expect((await h.app.request("/api/settings", { method: "PATCH" })).status).toBe(409);
    expect(
      (await h.app.request("/api/update/activate", { method: "POST", headers: token })).status,
    ).toBe(200);
    expect((await h.app.request("/api/settings", { method: "PATCH" })).status).not.toBe(409);
    expect(await (await h.app.request("/api/update")).text()).not.toContain("a".repeat(64));
    expect((await h.app.request("/api/health")).headers.get("X-Slopify-Version")).toBe("0.6.1");
  });
});
