import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { fixedClock } from "../../kernel/clock.fake.js";
import { openDb } from "../../kernel/db/index.js";
import { migrate } from "../../kernel/db/migrate.js";
import type { Ids } from "../../kernel/ids.js";
import type { Log } from "../../kernel/log.js";
import type { Paths } from "../../kernel/paths.js";
import { ensureDirs, layout } from "../../kernel/paths.js";
import type { RunConfig } from "../../slices/admission/model.js";
import { insertProject } from "../../slices/admission/repo.js";
import { projectDir } from "../../slices/storage/layout.js";
import { createHub } from "../events/hub.js";
import { createApp } from "./app.js";

const clock = fixedClock("2026-09-27T10:00:00.000Z");
const log: Log = { write: (): void => {} };

interface Harness {
  readonly app: ReturnType<typeof createApp>;
  readonly db: DatabaseSync;
  readonly paths: Paths;
  readonly ticked: string[];
}

function harness(): Harness {
  const paths = layout(mkdtempSync(join(tmpdir(), "slopify-trash-http-")));
  ensureDirs(paths, { mode: 0o700 });
  const db = openDb(paths.db);
  migrate(db, clock);
  let n = 0;
  const ids: Ids = { next: (): string => `id${String(++n)}` };
  const ticked: string[] = [];
  const app = createApp({
    db,
    paths,
    hub: createHub({ ids, log }),
    runner: {
      tick: (projectId): void => void ticked.push(projectId),
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
  return { app, db, paths, ticked };
}

const config: RunConfig = {
  title: "Rope Tricks",
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
  values: { topic: "rope" },
  provided: {},
  silenceGapSeconds: 3,
  imageSeconds: 15,
  zoomPercent: 22.5,
  motionStyle: "zoom",
  edgeSilenceSeconds: 0,
  rendered: {},
};

function project(h: Harness, id: string): string {
  insertProject(h.db, {
    id,
    title: config.title,
    format: config.format,
    config,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
  });
  h.db
    .prepare("INSERT INTO stages (id, project_id, kind, source, state) VALUES (?, ?, ?, ?, ?)")
    .run(`${id}-s`, id, "article", "provide", "done");
  const dir = projectDir(h.paths, id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "article.md"), "# Rope");
  return dir;
}

async function json(response: Response): Promise<unknown> {
  return response.json();
}

describe("/api/trash", () => {
  it("lists what Delete moved there, from every kind", async () => {
    const h = harness();
    project(h, "p1");
    const made = await h.app.request("/api/prompts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "article", name: "Explainer", body: "Write {topic}." }),
    });
    const prompt = (await made.json()) as { id: string };

    expect((await h.app.request("/api/projects/p1", { method: "DELETE" })).status).toBe(204);
    expect((await h.app.request(`/api/prompts/${prompt.id}`, { method: "DELETE" })).status).toBe(
      204,
    );
    expect(await json(await h.app.request("/api/prompts"))).toMatchObject({ prompts: [] });

    const listed = (await json(await h.app.request("/api/trash"))) as {
      items: { kind: string; id: string; name: string; daysLeft: number }[];
    };
    expect(listed.items.map((item) => [item.kind, item.id, item.name, item.daysLeft])).toEqual([
      ["project", "p1", "Rope Tricks", 30],
      ["prompt", prompt.id, "Explainer", 30],
    ]);
  });

  it("restores a project, which the runner picks up again", async () => {
    const h = harness();
    project(h, "p1");
    await h.app.request("/api/projects/p1", { method: "DELETE" });

    const response = await h.app.request("/api/trash/project/p1/restore", { method: "POST" });

    expect(response.status).toBe(200);
    expect(await json(response)).toEqual({
      restored: { kind: "project", id: "p1", name: "Rope Tricks", renamedFrom: null },
    });
    expect(h.ticked).toEqual(["p1"]);
    expect((await h.app.request("/api/projects/p1")).status).toBe(200);
  });

  it("deletes a project for good, folder first", async () => {
    const h = harness();
    const dir = project(h, "p1");
    await h.app.request("/api/projects/p1", { method: "DELETE" });

    const response = await h.app.request("/api/trash/project/p1", { method: "DELETE" });

    expect(response.status).toBe(204);
    expect(existsSync(dir)).toBe(false);
    expect(await json(await h.app.request("/api/trash"))).toEqual({ items: [] });
  });

  it("says what to do when the item is not in the trash", async () => {
    const h = harness();
    project(h, "p1");

    const restore = await h.app.request("/api/trash/project/p1/restore", { method: "POST" });
    expect(restore.status).toBe(404);
    expect(await json(restore)).toMatchObject({
      reason: "not-found",
      detail: expect.stringMatching(/Settings → Trash/),
    });
    const removed = await h.app.request("/api/trash/project/p1", { method: "DELETE" });
    expect(removed.status).toBe(404);
  });

  it("refuses a kind or id that is not one", async () => {
    const h = harness();

    expect((await h.app.request("/api/trash/voice/x/restore", { method: "POST" })).status).toBe(
      400,
    );
    expect((await h.app.request("/api/trash/project/..%2Fetc", { method: "DELETE" })).status).toBe(
      400,
    );
  });
});
