import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { fixedClock } from "../../kernel/clock.fake.js";
import { openDb } from "../../kernel/db/index.js";
import { migrate } from "../../kernel/db/migrate.js";
import { ensureDirs, layout } from "../../kernel/paths.js";
import type { Runner } from "../../kernel/runner/index.js";
import type { RunDraft } from "../admission/model.js";
import { projectById, setProjectPaused } from "../admission/repo.js";
import { outputsOf, stagedFiles } from "../storage/repo.js";
import { type StorageDeps, stageUpload } from "../storage/staging.js";
import { enqueueBatch, pumpQueue, queueEntries, queueWaiting } from "./index.js";

const clock = fixedClock("2026-09-10T00:00:00Z");
const databases: ReturnType<typeof openDb>[] = [];
afterEach(() => {
  for (const db of databases.splice(0)) db.close();
});
function harness(): StorageDeps {
  const paths = layout(mkdtempSync(join(tmpdir(), "slopify-batch-")));
  ensureDirs(paths, { mode: 0o700 });
  const db = openDb(paths.db);
  databases.push(db);
  migrate(db, clock);
  let id = 0;
  return {
    db,
    paths,
    clock,
    ids: { next: () => `id${++id}` },
    log: { write: () => {} },
    emit: () => {},
  };
}
const draft: RunDraft = {
  title: "Video",
  format: "16:9",
  sources: {
    research: "off",
    article: "generate",
    audio: "off",
    images: "off",
    thumbnail: "off",
    video: "off",
  },
  imagePrompts: [],
  values: {},
  provided: {},
  silenceGapSeconds: 0,
};
const runs = ["Arda", "Gondor", "Rohan"].map((title) => ({
  draft: { ...draft, title, values: { topic: title } },
  rendered: { article: `Write about ${title}` },
}));
describe("durable video batches", () => {
  it("creates distinct snapshots once and queues one video at a time across restart", () => {
    const h = harness();
    const queued = enqueueBatch(h, "batch", runs);
    expect(enqueueBatch(h, "batch", runs)).toEqual(queued);
    expect(projectById(h.db, queued[1]?.projectId ?? "")?.config.rendered.article).toBe(
      "Write about Gondor",
    );
    const ticks: string[] = [];
    const runner: Runner = {
      tick: (id) => {
        ticks.push(id);
      },
      settled: async () => {},
      abortAll: async () => {},
      abortProject: async () => {},
    };
    pumpQueue(h.db, runner);
    const first = queued[0]?.projectId ?? "";
    const second = queued[1]?.projectId ?? "";
    expect(ticks).toEqual([first]);
    expect(queueWaiting(h.db, second)).toBe(true);
    // A new scheduler sees the same active row; no in-memory queue is required.
    pumpQueue(h.db, runner);
    expect(ticks).toEqual([first, first]);
    setProjectPaused(h.db, first, true, clock.now().toISOString());
    pumpQueue(h.db, runner);
    expect(ticks).toHaveLength(2);
    setProjectPaused(h.db, first, false, clock.now().toISOString());
    h.db
      .prepare("UPDATE stages SET state='failed' WHERE project_id=? AND kind='article'")
      .run(first);
    pumpQueue(h.db, { ...runner, hasInflight: (id) => id === first });
    expect(ticks).toHaveLength(2);
    pumpQueue(h.db, runner);
    expect(ticks.at(-1)).toBe(second);
    expect(queueEntries(h.db)).toHaveLength(2);
  });
  it("copies shared uploads to every project before consuming staging", async () => {
    const h = harness();
    const staged = await stageUpload(h, {
      stageKind: "audio",
      originalFilename: "voice.mp3",
      content: (async function* () {
        yield new TextEncoder().encode("audio");
      })(),
    });
    if (!staged.ok) throw new Error("Upload failed");
    const batch = runs.map((run) => ({
      ...run,
      draft: {
        ...run.draft,
        sources: { ...run.draft.sources, audio: "provide" as const },
        provided: { audio: staged.file.id },
      },
    }));
    const queue = enqueueBatch(h, "shared", batch);
    for (const item of queue) {
      const output = outputsOf(h.db, item.projectId)[0];
      expect(output).toBeDefined();
      expect(readFileSync(join(h.paths.projects, item.projectId, output?.path ?? ""), "utf8")).toBe(
        "audio",
      );
    }
    expect(stagedFiles(h.db)).toHaveLength(0);
  });
  it("rolls back all projects and keeps uploads when a later attachment fails", async () => {
    const h = harness();
    const staged = await stageUpload(h, {
      stageKind: "audio",
      originalFilename: "voice.mp3",
      content: (async function* () {
        yield new Uint8Array([1, 2]);
      })(),
    });
    if (!staged.ok) throw new Error("Upload failed");
    const batch = runs.map((run, i) => ({
      ...run,
      draft: {
        ...run.draft,
        sources: { ...run.draft.sources, audio: "provide" as const },
        provided: { audio: i ? "missing" : staged.file.id },
      },
    }));
    expect(() => enqueueBatch(h, "rollback", batch)).toThrow();
    expect(h.db.prepare("SELECT * FROM projects").all()).toHaveLength(0);
    expect(queueEntries(h.db)).toHaveLength(0);
    expect(stagedFiles(h.db)).toHaveLength(1);
  });
});
