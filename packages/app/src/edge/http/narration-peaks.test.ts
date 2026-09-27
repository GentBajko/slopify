import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { fixedClock } from "../../kernel/clock.fake.js";
import { openDb } from "../../kernel/db/index.js";
import { migrate } from "../../kernel/db/migrate.js";
import { ulidIds } from "../../kernel/ids.js";
import { ensureDirs, layout } from "../../kernel/paths.js";
import { narrationAudio, peaksOf } from "../../slices/narration/peaks.js";
import { seedSample } from "../../slices/onboarding/sample.js";
import type { RevisionView } from "../../slices/revisions/model.js";
import { createHub } from "../events/hub.js";
import { createApp } from "./app.js";

const clock = fixedClock("2026-09-27T10:00:00.000Z");
const cleanup: (() => void)[] = [];
afterEach(() => {
  for (const done of cleanup.splice(0)) done();
});

describe("GET /api/projects/:id/narration/peaks", () => {
  it("draws the joined narration once it is ready, decoding each file once", async () => {
    const paths = layout(mkdtempSync(join(tmpdir(), "slopify-peaks-")));
    ensureDirs(paths, { mode: 0o700 });
    const db = openDb(paths.db);
    migrate(db, clock);
    cleanup.push(() => {
      db.close();
      rmSync(paths.dataDir, { recursive: true, force: true });
    });
    const log = { write: () => undefined };
    await seedSample({ db, paths, clock, ids: ulidIds, log, appVersion: "3.0.0" });
    const decoded: string[] = [];
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
      version: "3.0.0",
      webDist: join(paths.dataDir, "missing"),
      flushSoon: () => undefined,
      probe: async () => ({ ran: false, stdout: "" }),
      decodePeaks: async (path) => {
        decoded.push(path);
        return { seconds: 2, peaks: [0.1, 0.5, 0.2] };
      },
    });
    const { projectId } = (await (await app.request("/api/onboarding/sample")).json()) as {
      projectId: string;
    };
    for (let read = 0; read < 2; read++) {
      const response = await app.request(`/api/projects/${projectId}/narration/peaks`);
      expect(await response.json()).toMatchObject({
        complete: true,
        pieces: [{ key: "audio:provided", seconds: 2, peaks: [0.1, 0.5, 0.2] }],
      });
    }
    expect(decoded).toHaveLength(1);
    expect(decoded[0]).toMatch(/audio-body\.mp3$/);
    expect((await app.request("/api/projects/nothing/narration/peaks")).status).toBe(404);
  });
});

describe("narrationAudio", () => {
  const piece = (key: string, done: boolean, segment = true) => ({
    key,
    stageKind: "audio" as const,
    assetId: `asset-${key}`,
    fingerprint: "f",
    recordId: key,
    publicationId: null,
    selected: true,
    available: true,
    piece: {
      id: key,
      stageId: "s",
      kind: "chunk" as const,
      idx: 1,
      state: done ? ("done" as const) : ("running" as const),
      payload: JSON.stringify(segment ? { segment: "body", text: "x" } : { prompt: "x" }),
    },
  });

  it("grows piece by piece in spoken order before the narration is joined", () => {
    const view = {
      outputs: [],
      pieces: [
        piece("audio:outro", true),
        piece("audio:body:body:10", true),
        piece("audio:body:body:2", true),
        piece("audio:body:body:3", false),
        piece("audio:intro", true),
        piece("audio:cues", true, false),
      ],
    } as unknown as RevisionView;
    expect(narrationAudio(view)).toEqual({
      complete: false,
      pieces: [
        { key: "audio:intro", assetId: "asset-audio:intro" },
        { key: "audio:body:body:2", assetId: "asset-audio:body:body:2" },
        { key: "audio:body:body:10", assetId: "asset-audio:body:body:10" },
        { key: "audio:outro", assetId: "asset-audio:outro" },
      ],
    });
  });
});

describe("peaksOf", () => {
  it("takes the loudest sample of each slice", () => {
    const samples = Int16Array.from([0, 100, -16384, 5, 32767, 1, 0, -2]);
    expect(peaksOf(samples, 4, 2)).toEqual([0.003, 0.5, 1, 0]);
  });
});
