import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { fixedClock } from "../../kernel/clock.fake.js";
import { openDb } from "../../kernel/db/index.js";
import { migrate } from "../../kernel/db/migrate.js";
import type { Ids } from "../../kernel/ids.js";
import type { Log } from "../../kernel/log.js";
import { ensureDirs, layout } from "../../kernel/paths.js";
import type { TelemetryCounters, TelemetryEventType } from "../../slices/telemetry/model.js";
import type { TelemetryDeps } from "../../slices/telemetry/record.js";
import { record } from "../../slices/telemetry/record.js";
import { insertMachine } from "../../slices/telemetry/repo.js";
import type { Usage } from "../../slices/telemetry/usage.js";
import { createHub } from "../events/hub.js";
import { createApp } from "./app.js";

// `GET /api/usage`, the data behind the Usage screen. The rows are written by the real
// `record`, so what this route serves is the same log the collector receives.

const clock = fixedClock("2026-09-03T10:00:00.000Z");
const log: Log = { write: (): void => {} };
const machineId = "7b1f0d2e-0000-4000-8000-000000000000";

interface Harness {
  readonly app: ReturnType<typeof createApp>;
  readonly db: DatabaseSync;
  readonly telemetry: TelemetryDeps;
}

function harness(seen = true): Harness {
  const paths = layout(mkdtempSync(join(tmpdir(), "slopify-usage-")));
  ensureDirs(paths, { mode: 0o700 });
  const db = openDb(paths.db);
  migrate(db, clock);
  let n = 0;
  const ids: Ids = {
    next: (): string => {
      n += 1;
      return `id${String(n)}`;
    },
  };
  if (seen) {
    insertMachine(db, { machineId, noticeSeenAt: clock.now().toISOString(), appVersion: "1.2.3" });
  }
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
    probe: () => Promise.resolve({ ran: false, stdout: "" }),
    flushSoon: (): void => {},
  });
  return { app, db, telemetry: { db, ids, clock, log, appVersion: "1.2.3" } };
}

function put(h: Harness, type: TelemetryEventType, counters: TelemetryCounters = {}): void {
  record(h.telemetry, type, counters);
}

async function usage(h: Harness): Promise<Usage> {
  const response = await h.app.request("/api/usage");
  expect(response.status).toBe(200);
  return (await response.json()) as Usage;
}

describe("GET /api/usage", () => {
  // The "Fresh install" state of the screen: every counter at zero and no table.
  it("answers zeroes and no machine id before the notice was dismissed", async () => {
    const h = harness(false);

    expect(await usage(h)).toEqual({
      machineId: null,
      appVersion: "1.2.3",
      counters: {
        videosMade: 0,
        audioSeconds: 0,
        imagesMade: 0,
        tokensUsed: 0,
        projects: 0,
      },
      byStage: [],
    });
  });

  it("serves the five counters, the token table, and the machine id with the version", async () => {
    const h = harness();
    put(h, "install");
    put(h, "project.created");
    put(h, "stage.completed", {
      stage: "research",
      provider: "openrouter",
      model: "openai/gpt-5",
      tokensIn: 400,
      tokensOut: 1200,
    });
    put(h, "stage.completed", {
      stage: "article",
      provider: "openrouter",
      model: "openai/gpt-5",
      tokensIn: 300,
      tokensOut: 900,
    });
    put(h, "stage.completed", {
      stage: "audio",
      segment: "body",
      provider: "elevenlabs",
      audioSeconds: 480.5,
    });
    put(h, "stage.completed", {
      stage: "images",
      provider: "fal",
      model: "flux",
      images: 6,
    });
    put(h, "stage.completed", { stage: "video" });

    expect(await usage(h)).toEqual({
      machineId,
      appVersion: "1.2.3",
      counters: {
        videosMade: 1,
        audioSeconds: 480.5,
        imagesMade: 6,
        tokensUsed: 2800,
        projects: 1,
      },
      // Sorted by tokens out.
      byStage: [
        {
          stage: "research",
          provider: "openrouter",
          model: "openai/gpt-5",
          tokensIn: 400,
          tokensOut: 1200,
        },
        {
          stage: "article",
          provider: "openrouter",
          model: "openai/gpt-5",
          tokensIn: 300,
          tokensOut: 900,
        },
      ],
    });
  });

  // The totals are the log's, "independent of delivery", so a queue that
  // has already gone to the collector reads exactly the same.
  it("counts events that have already been delivered", async () => {
    const h = harness();
    put(h, "stage.completed", { stage: "video" });
    h.db.prepare("UPDATE telemetry_events SET delivered_at = ?").run(clock.now().toISOString());

    expect((await usage(h)).counters.videosMade).toBe(1);
  });
});
