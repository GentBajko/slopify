import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { fixedClock } from "../../kernel/clock.fake.js";
import { openDb } from "../../kernel/db/index.js";
import { migrate } from "../../kernel/db/migrate.js";
import { ensureDirs, layout } from "../../kernel/paths.js";
import type { RunConfig } from "../../slices/admission/model.js";
import { insertProject, projectById } from "../../slices/admission/repo.js";
import {
  baselineSuccessSchema,
  revisionMutationSuccessSchema,
} from "../../slices/revisions/schema.js";
import { createHub } from "../events/hub.js";
import { createApp } from "./app.js";

function harness() {
  const paths = layout(mkdtempSync(join(tmpdir(), "slopify-revision-http-")));
  ensureDirs(paths, { mode: 0o700 });
  const db = openDb(paths.db);
  const clock = fixedClock("2026-09-10T00:00:00.000Z");
  const log = { write: (): void => {} };
  let n = 0;
  const ids = { next: (): string => `id${++n}` };
  migrate(db, clock);
  const config: RunConfig = {
    title: "Saved",
    format: "16:9",
    imagePrompts: [],
    values: {},
    rendered: {},
    provided: { article: "Article." },
    silenceGapSeconds: 0,
    imageSeconds: 15,
    zoomPercent: 22.5,
    edgeSilenceSeconds: 0,
    sources: {
      research: "off",
      article: "provide",
      audio: "off",
      images: "off",
      thumbnail: "off",
      video: "off",
    },
  };
  insertProject(db, {
    id: "p1",
    title: config.title,
    format: config.format,
    config,
    createdAt: clock.now().toISOString(),
    updatedAt: clock.now().toISOString(),
  });
  const ticked: string[] = [];
  const app = createApp({
    db,
    paths,
    clock,
    ids,
    log,
    hub: createHub({ ids, log }),
    runner: {
      tick: (id: string): void => {
        ticked.push(id);
      },
      settled: async (): Promise<void> => {},
      abortProject: async (): Promise<void> => {},
      abortAll: async (): Promise<void> => {},
    },
    version: "0.8.5",
    webDist: join(paths.dataDir, "absent"),
    flushSoon: (): void => {},
    probe: () => Promise.resolve({ ran: false, stdout: "" }),
  });
  return {
    app,
    db,
    ticked,
    close: (): void => {
      db.close();
      rmSync(paths.dataDir, { recursive: true, force: true });
    },
  };
}

it("saves without dispatch, replays a receipt and refuses an obsolete base", async () => {
  const h = harness();
  try {
    const response = await h.app.request("/api/projects/p1/revisions/prepare", { method: "POST" });
    expect(response.status).toBe(200);
    const baseline = baselineSuccessSchema.parse(await response.json());
    const input = {
      baseRevisionId: baseline.view.revision.id,
      idempotencyKey: randomUUID(),
      edit: {
        config: { ...baseline.view.revision.config, title: "Changed" },
        content: baseline.view.revision.content,
      },
    };
    const post = (body: unknown) =>
      h.app.request("/api/projects/p1/revisions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    const first = await post(input);
    expect(first.status).toBe(200);
    const saved = revisionMutationSuccessSchema.parse(await first.json());
    const repeat = revisionMutationSuccessSchema.parse(await (await post(input)).json());
    expect(repeat.view.revision.id).toBe(saved.view.revision.id);
    expect(repeat.duplicate).toBe(true);
    expect(projectById(h.db, "p1")?.title).toBe("Changed");
    expect(h.ticked).toEqual([]);
    const conflict = await post({ ...input, idempotencyKey: randomUUID() });
    expect(conflict.status).toBe(409);
    expect(conflict.headers.get("content-type")).toContain("application/problem+json");
    expect(await conflict.json()).toMatchObject({
      status: 409,
      reason: "conflict",
      currentRevisionId: saved.view.revision.id,
    });
    for (const invalid of [
      { ...input, unexpected: true },
      { ...input, idempotencyKey: "not-a-uuid" },
    ]) {
      const rejected = await post(invalid);
      expect(rejected.status).toBe(400);
      expect(await rejected.json()).toHaveProperty("errors");
    }
  } finally {
    h.close();
  }
});

it.each([
  ["PATCH", "/providers"],
  ["PUT", "/article"],
  ["DELETE", "/images/o1"],
  ["POST", "/images/o1/regenerate"],
  ["PATCH", "/subtitles"],
])("refuses an older browser's %s %s without changing its project", async (method, suffix) => {
  const h = harness();
  try {
    const before = projectById(h.db, "p1");
    const response = await h.app.request(`/api/projects/p1${suffix}`, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ reason: "revision-required" });
    expect(projectById(h.db, "p1")).toEqual(before);
    expect(h.db.prepare("SELECT count(*) AS n FROM outputs").get()).toEqual({ n: 0 });
    expect(h.ticked).toEqual([]);
  } finally {
    h.close();
  }
});

it("lists scoped history, restores into a new revision and keeps receipt replay read-only", async () => {
  const h = harness();
  const post = (path: string, input?: unknown) =>
    h.app.request(`/api/projects/p1/${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      ...(input === undefined ? {} : { body: JSON.stringify(input) }),
    });
  try {
    const baseline = baselineSuccessSchema.parse(await (await post("revisions/prepare")).json());
    const second = baselineSuccessSchema.parse(await (await post("revisions/prepare")).json());
    expect(second.created).toBe(false);
    expect(second.view.revision.id).toBe(baseline.view.revision.id);
    const saved = revisionMutationSuccessSchema.parse(
      await (
        await post("revisions", {
          baseRevisionId: baseline.view.revision.id,
          idempotencyKey: randomUUID(),
          edit: {
            config: { ...baseline.view.revision.config, title: "Edited" },
            content: baseline.view.revision.content,
          },
        })
      ).json(),
    );
    const history = await h.app.request("/api/projects/p1/revisions");
    expect(await history.json()).toMatchObject({
      revisions: expect.arrayContaining([
        {
          id: baseline.view.revision.id,
          title: "Saved",
          current: false,
          parentId: null,
          restoredFromId: null,
          createdAt: expect.any(String),
        },
        {
          id: saved.view.revision.id,
          title: "Edited",
          current: true,
          parentId: baseline.view.revision.id,
          restoredFromId: null,
          createdAt: expect.any(String),
        },
      ]),
    });
    expect(
      await (await h.app.request(`/api/projects/p1/revisions/${baseline.view.revision.id}`)).json(),
    ).toMatchObject({ view: { current: false, revision: { id: baseline.view.revision.id } } });
    expect(
      (await h.app.request(`/api/projects/other/revisions/${baseline.view.revision.id}`)).status,
    ).toBe(404);
    expect((await h.app.request("/api/projects/other/revisions")).status).toBe(404);
    expect(
      (await h.app.request("/api/projects/other/revisions/prepare", { method: "POST" })).status,
    ).toBe(404);
    const input = {
      baseRevisionId: saved.view.revision.id,
      targetRevisionId: baseline.view.revision.id,
      idempotencyKey: randomUUID(),
    };
    const restored = revisionMutationSuccessSchema.parse(
      await (await post("revisions/restore", input)).json(),
    );
    expect(restored.view.revision.id).not.toBe(baseline.view.revision.id);
    expect(restored.view.revision.restoredFromId).toBe(baseline.view.revision.id);
    expect(restored.view.revision.config.title).toBe("Saved");
    const replay = revisionMutationSuccessSchema.parse(
      await (await post("revisions/restore", input)).json(),
    );
    expect(replay.duplicate).toBe(true);
    expect(replay.view.revision.id).toBe(restored.view.revision.id);
    expect((await post("revisions/restore", { ...input, idempotencyKey: "bad" })).status).toBe(400);
    expect(h.ticked).toEqual([]);
  } finally {
    h.close();
  }
});

it("validates rebuild inputs and reports missing rebuild wiring as unavailable", async () => {
  const h = harness();
  try {
    const post = (path: string, input: unknown) =>
      h.app.request(`/api/projects/p1/${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      });
    const preview = { baseRevisionId: "r1", request: { kind: "allAffected" } };
    expect((await post("rebuild/preview", { ...preview, extra: true })).status).toBe(400);
    const unavailable = await post("rebuild/preview", preview);
    expect(unavailable.status).toBe(503);
    expect(unavailable.headers.get("content-type")).toBe("application/problem+json");
    const start = {
      baseRevisionId: "r1",
      previewId: "p1",
      idempotencyKey: randomUUID(),
      acknowledgeUnknownCosts: true,
      confirmedProvidedWorkKeys: [],
    };
    expect((await post("rebuild", start)).status).toBe(503);
    expect((await post("rebuild", { ...start, idempotencyKey: "bad" })).status).toBe(400);
  } finally {
    h.close();
  }
});
