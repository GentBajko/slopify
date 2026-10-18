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
import type { RunDraft } from "../../slices/admission/model.js";
import { startRun } from "../../slices/admission/start.js";
import { createHub } from "../events/hub.js";
import { createApp } from "./app.js";

const clock = fixedClock("2026-09-02T10:00:00.000Z");
const log: Log = { write: (): void => {} };

interface Harness {
  readonly app: ReturnType<typeof createApp>;
  readonly db: DatabaseSync;
  readonly paths: ReturnType<typeof layout>;
  readonly ids: Ids;
}

function harness(): Harness {
  const paths = layout(mkdtempSync(join(tmpdir(), "slopify-keywords-")));
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
  });
  return { app, db, paths, ids };
}

const draft: RunDraft = {
  title: "The Gate",
  format: "16:9",
  sources: {
    research: "off",
    article: "provide",
    audio: "off",
    images: "off",
    thumbnail: "off",
    video: "off",
  },
  imagePrompts: [],
  values: {},
  provided: { article: "Text." },
  silenceGapSeconds: 0,
  imageSeconds: 15,
  zoomPercent: 22.5,
  motionStyle: "zoom",
  edgeSilenceSeconds: 0,
};

describe("GET /api/keywords", () => {
  it("lists every keyword with its places and cost spelt out", async () => {
    const { app } = harness();
    const response = await app.request("/api/keywords");
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      keywords: {
        name: string;
        cost: { kind: string; label: string };
        places: { label: string }[];
      }[];
    };
    const summary = body.keywords.find((one) => one.name === "Slopify_Summary");
    expect(summary?.cost).toEqual({
      kind: "digest",
      label: "Part of one AI call per run: the keyword digest, shared by every digest keyword.",
    });
    expect(summary?.places.map((one) => one.label)).toContain("Description");
  });
});

describe("GET /api/keywords/facts/:projectId", () => {
  it("copies the project's facts again, leaving the project itself out", async () => {
    const h = harness();
    const project = startRun(
      { db: h.db, paths: h.paths, ids: h.ids, clock, log, emit: (): void => {} },
      draft,
      {},
    ).project;
    const response = await h.app.request(`/api/keywords/facts/${project.id}`);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ keywordFacts: { episode: 1 } });
  });

  it("says a project that is gone is gone", async () => {
    const { app } = harness();
    const response = await app.request("/api/keywords/facts/nope");
    expect(response.status).toBe(404);
    expect(((await response.json()) as { detail: string }).detail).toBe(
      "This project no longer exists. Go back to Projects to pick another.",
    );
  });
});
