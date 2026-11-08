import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { fixedClock } from "../../kernel/clock.fake.js";
import { openDb } from "../../kernel/db/index.js";
import { migrate } from "../../kernel/db/migrate.js";
import { ulidIds } from "../../kernel/ids.js";
import { ensureDirs, layout } from "../../kernel/paths.js";
import { seedSamples } from "../../slices/onboarding/sample.js";
import { createHub } from "../events/hub.js";
import { createApp } from "./app.js";
import type { PronunciationGaps, PronunciationHeard } from "./pronunciation-check.js";

const clock = fixedClock("2026-11-08T10:00:00.000Z");
const cleanup: (() => void)[] = [];
afterEach(() => {
  for (const done of cleanup.splice(0)) done();
});

async function fixture() {
  const paths = layout(mkdtempSync(join(tmpdir(), "slopify-pronunciation-")));
  ensureDirs(paths, { mode: 0o700 });
  const db = openDb(paths.db);
  migrate(db, clock);
  cleanup.push(() => {
    db.close();
    rmSync(paths.dataDir, { recursive: true, force: true });
  });
  const log = { write: () => undefined };
  await seedSamples({ db, paths, clock, ids: ulidIds, log, appVersion: "4.1.0" });
  const app = createApp({
    db,
    paths,
    hub: createHub({ ids: ulidIds, log }),
    runner: {
      tick: () => undefined,
      settled: async () => undefined,
      abortProject: async () => undefined,
      abortAll: async () => undefined,
    },
    clock,
    ids: ulidIds,
    log,
    version: "4.1.0",
    webDist: join(paths.dataDir, "missing"),
    flushSoon: () => undefined,
    probe: async () => ({ ran: false, stdout: "" }),
  });
  const { projectId } = (await (await app.request("/api/onboarding/sample")).json()) as {
    projectId: string;
  };
  return { app, projectId };
}

describe("GET /api/projects/:projectId/pronunciations/gaps", () => {
  it("answers for a finished project without changing or costing anything", async () => {
    const { app, projectId } = await fixture();
    const response = await app.request(`/api/projects/${projectId}/pronunciations/gaps`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as PronunciationGaps;
    expect(body.revisionId).not.toBeNull();
    expect(body.ready).toBe(true);
    // Every name in the sample's article is pronounced, so there is no line to show.
    expect(body.ahead?.names).toEqual([]);
    expect(body.notice).toBeNull();
    // Nothing is cached: a name added to the list has to change the answer at once.
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("says a project it cannot find, in words that say where to go", async () => {
    const { app } = await fixture();
    const response = await app.request("/api/projects/nothing/pronunciations/gaps");
    expect(response.status).toBe(404);
    expect(await response.text()).toContain("Go back to Projects");
  });
});

describe("GET /api/projects/:projectId/pronunciations/heard", () => {
  it("leaves both halves empty while the narration and its timing are unmade", async () => {
    const { app, projectId } = await fixture();
    const response = await app.request(`/api/projects/${projectId}/pronunciations/heard`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as PronunciationHeard;
    expect(body.revisionId).not.toBeNull();
    expect(body.notice).toBeNull();
  });

  it("says a project it cannot find", async () => {
    const { app } = await fixture();
    expect((await app.request("/api/projects/nothing/pronunciations/heard")).status).toBe(404);
  });
});
