import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { fixedClock } from "../../kernel/clock.fake.js";
import { openDb } from "../../kernel/db/index.js";
import { migrate } from "../../kernel/db/migrate.js";
import type { Ids } from "../../kernel/ids.js";
import type { Log } from "../../kernel/log.js";
import { ensureDirs, layout } from "../../kernel/paths.js";
import type { StageKind, StageState } from "../../kernel/pipeline.js";
import { stageKinds } from "../../kernel/pipeline.js";
import { projectById, stagesOf } from "../../slices/admission/repo.js";
import { createHub } from "../events/hub.js";
import { createApp } from "./app.js";

const clock = fixedClock("2026-09-03T09:00:00.000Z");
const log: Log = { write: (): void => {} };
const projectId = "p1";

interface Harness {
  readonly app: ReturnType<typeof createApp>;
  readonly db: DatabaseSync;
  readonly ticked: string[];
  readonly aborted: string[];
  readonly dir: string;
}

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const close of cleanups.splice(0)) close();
});

function harness(states: Partial<Record<StageKind, StageState>> = {}): Harness {
  const paths = layout(mkdtempSync(join(tmpdir(), "slopify-actions-")));
  ensureDirs(paths, { mode: 0o700 });
  const db = openDb(paths.db);
  migrate(db, clock);
  cleanups.push(() => {
    db.close();
    rmSync(paths.dataDir, { recursive: true, force: true });
  });
  const dir = join(paths.projects, projectId);
  mkdirSync(join(dir, "images"), { recursive: true });

  db.prepare("INSERT INTO projects VALUES (?, 'Rope', '16:9', ?, ?, ?)").run(
    projectId,
    JSON.stringify({
      title: "Rope",
      format: "16:9",
      sources: {
        research: "off",
        article: "generate",
        audio: "generate",
        images: "generate",
        thumbnail: "off",
        video: "generate",
      },
      imagePrompts: [],
      values: {},
      provided: {},
      rendered: {},
      silenceGapSeconds: 3,
    }),
    "2026-09-03",
    "2026-09-03",
  );
  for (const kind of stageKinds) {
    db.prepare(
      "INSERT INTO stages (id, project_id, kind, source, state) VALUES (?, ?, ?, 'generate', ?)",
    ).run(`s-${kind}`, projectId, kind, states[kind] ?? "done");
  }
  const insert = db.prepare(
    "INSERT INTO outputs (id, project_id, stage_kind, role, path, bytes, meta, created_at) VALUES (?, ?, ?, ?, ?, 9, ?, '2026-09-03')",
  );
  writeFileSync(join(dir, "article.md"), "# Old");
  insert.run("o-md", projectId, "article", "article_md", "article.md", "{}");
  for (const index of [1, 2]) {
    const path = `images/00${String(index)}.png`;
    writeFileSync(join(dir, path), "png");
    insert.run(
      `o-image-${String(index)}`,
      projectId,
      "images",
      "image",
      path,
      `{"index":${String(index)}}`,
    );
  }

  let n = 0;
  const ids: Ids = {
    next: (): string => {
      n += 1;
      return `id${String(n)}`;
    },
  };
  const ticked: string[] = [];
  const aborted: string[] = [];
  const app = createApp({
    db,
    paths,
    hub: createHub({ ids, log }),
    runner: {
      tick: (id: string): void => {
        ticked.push(id);
      },
      settled: async (): Promise<void> => {},
      abortProject: async (id: string): Promise<void> => {
        aborted.push(id);
        db.prepare(
          "UPDATE stages SET state = 'canceled', failure_reason = 'canceled by user' WHERE project_id = ? AND state = 'running'",
        ).run(id);
      },
      abortAll: async (): Promise<void> => {},
    },
    clock,
    ids,
    log,
    version: "1.2.3",
    webDist: join(paths.dataDir, "missing"),
    flushSoon: (): void => {},
    probe: () => Promise.resolve({ ran: false, stdout: "" }),
    modelsFor: async () => [
      { id: "new", name: "New" },
      { id: "typed/model-id", name: "Typed model" },
    ],
  });
  return { app, db, ticked, aborted, dir };
}

describe("retired project mutations", () => {
  it.each([
    ["PATCH", "/providers"],
    ["PUT", "/article"],
    ["DELETE", "/images/o-image-1"],
    ["POST", "/images/o-image-1/regenerate"],
    ["PATCH", "/subtitles"],
  ])("refuses %s %s and preserves completed media and state", async (method, suffix) => {
    const h = harness();
    const before = {
      project: projectById(h.db, projectId),
      stages: stagesOf(h.db, projectId),
      outputs: h.db.prepare("SELECT * FROM outputs").all(),
    };
    const files = ["article.md", "images/001.png", "images/002.png"].map((path) => ({
      path,
      bytes: readFileSync(join(h.dir, path)),
    }));
    const response = await h.app.request(`/api/projects/${projectId}${suffix}`, {
      method,
      headers: { "content-type": "application/json" },
      body: "{invalid json",
    });
    expect(response.status).toBe(409);
    expect(response.headers.get("content-type")).toBe("application/problem+json");
    expect(await response.json()).toMatchObject({ reason: "revision-required" });
    expect({
      project: projectById(h.db, projectId),
      stages: stagesOf(h.db, projectId),
      outputs: h.db.prepare("SELECT * FROM outputs").all(),
    }).toEqual(before);
    for (const file of files) expect(readFileSync(join(h.dir, file.path))).toEqual(file.bytes);
    expect(h.ticked).toEqual([]);
    expect(h.aborted).toEqual([]);
  });
  it("validates stage identifiers before refusing a retired action", async () => {
    const h = harness();
    expect(
      (await h.app.request(`/api/projects/${projectId}/stages/captions/rerun`, { method: "POST" }))
        .status,
    ).toBe(400);
  });
});

describe("explicit rebuild is required", () => {
  it.each(["/resume", "/stages/audio/retry"])(
    "does not dispatch an unheaded legacy run from %s",
    async (suffix) => {
      const h = harness({ audio: "canceled" });
      const before = stagesOf(h.db, projectId);
      const response = await h.app.request(`/api/projects/${projectId}${suffix}`, {
        method: "POST",
      });
      expect(response.status).toBe(400);
      expect(await response.json()).toHaveProperty("errors");
      expect(stagesOf(h.db, projectId)).toEqual(before);
      expect(h.ticked).toEqual([]);
    },
  );
});

describe("cancel and pause", () => {
  it("aborts a running project without dispatching it again", async () => {
    const h = harness({ audio: "running", video: "pending" });
    const response = await h.app.request(`/api/projects/${projectId}/cancel`, { method: "POST" });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      canceled: ["audio"],
      project: { status: "canceled" },
    });
    expect(h.aborted).toEqual([projectId]);
    expect(h.ticked).toEqual([]);
  });
  it("answers a second cancel without aborting anything", async () => {
    const h = harness({ audio: "canceled", video: "pending" });
    const response = await h.app.request(`/api/projects/${projectId}/cancel`, { method: "POST" });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ canceled: [] });
    expect(h.aborted).toEqual([]);
  });
  it("drains active work when pausing and leaves the project paused", async () => {
    const h = harness({ article: "running", audio: "pending", video: "pending" });
    const response = await h.app.request(`/api/projects/${projectId}/pause`, { method: "POST" });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      project: { id: projectId, paused: true, status: "paused" },
    });
    expect(stagesOf(h.db, projectId).find((stage) => stage.kind === "article")?.state).toBe(
      "pending",
    );
    expect(h.aborted).toEqual([projectId]);
    expect(h.ticked).toEqual([]);
  });
  it.each(["pause", "cancel"])("answers 404 for %s of an unknown project", async (action) => {
    const h = harness();
    expect(
      (await h.app.request(`/api/projects/missing/${action}`, { method: "POST" })).status,
    ).toBe(404);
  });
});
