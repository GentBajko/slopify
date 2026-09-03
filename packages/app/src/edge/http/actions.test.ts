import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
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
import type { StageKind, StageState } from "../../kernel/pipeline.js";
import { stageKinds } from "../../kernel/pipeline.js";
import { createHub } from "../events/hub.js";
import { createApp } from "./app.js";

// The action routes of `logic/12` and `logic/13`: what each refusal answers with, and
// that a successful action is the one thing that ticks the runner.

const clock = fixedClock("2026-09-03T09:00:00.000Z");
const log: Log = { write: (): void => {} };
const projectId = "p1";

interface Harness {
  readonly app: ReturnType<typeof createApp>;
  readonly db: DatabaseSync;
  readonly ticked: string[];
  readonly aborted: string[];
}

function harness(states: Partial<Record<StageKind, StageState>> = {}): Harness {
  const paths = layout(mkdtempSync(join(tmpdir(), "slopify-actions-")));
  ensureDirs(paths, { mode: 0o700 });
  const db = openDb(paths.db);
  migrate(db, clock);
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
  });
  return { app, db, ticked, aborted };
}

async function detailOf(response: Response): Promise<string> {
  expect(response.headers.get("content-type")).toBe("application/problem+json");
  return String(((await response.json()) as { detail?: unknown }).detail);
}

describe("re-run and retry", () => {
  it("re-runs a stage, answers with the project and ticks the runner", async () => {
    const h = harness();

    const response = await h.app.request(`/api/projects/${projectId}/stages/audio/rerun`, {
      method: "POST",
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      redone: ["audio", "video"],
      project: { id: projectId, status: "pending" },
    });
    expect(h.ticked).toEqual([projectId]);
  });

  it("refuses while the project is running, and does not tick", async () => {
    const h = harness({ video: "running" });

    const response = await h.app.request(`/api/projects/${projectId}/stages/audio/rerun`, {
      method: "POST",
    });

    expect(response.status).toBe(409);
    expect(await detailOf(response)).toBe(
      "This project is still running. Cancel it or wait for it to finish.",
    );
    expect(h.ticked).toEqual([]);
  });

  it("answers 404 for a project that does not exist", async () => {
    const h = harness();

    const response = await h.app.request("/api/projects/nope/stages/audio/rerun", {
      method: "POST",
    });

    expect(response.status).toBe(404);
    expect(await detailOf(response)).toBe("No project has that id.");
  });

  it("answers 400 for a stage kind the pipeline does not have", async () => {
    const h = harness();

    const response = await h.app.request(`/api/projects/${projectId}/stages/captions/rerun`, {
      method: "POST",
    });

    expect(response.status).toBe(400);
  });

  it("refuses to retry a stage that is done", async () => {
    const h = harness();

    const response = await h.app.request(`/api/projects/${projectId}/stages/audio/retry`, {
      method: "POST",
    });

    expect(response.status).toBe(409);
    expect(await detailOf(response)).toBe("Only a failed or canceled stage can be retried.");
  });

  it("retries a canceled stage", async () => {
    const h = harness({ audio: "canceled" });

    const response = await h.app.request(`/api/projects/${projectId}/stages/audio/retry`, {
      method: "POST",
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ redone: ["audio"] });
  });
});

describe("the article editor", () => {
  it("saves the markdown and re-runs from the audio", async () => {
    const h = harness();

    const response = await h.app.request(`/api/projects/${projectId}/article`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ markdown: "# Knots\n\nRope holds." }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ redone: ["audio", "video"] });
    expect(h.ticked).toEqual([projectId]);
  });

  it("refuses an article of nothing but whitespace", async () => {
    const h = harness();

    const response = await h.app.request(`/api/projects/${projectId}/article`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ markdown: "   " }),
    });

    expect(response.status).toBe(400);
    expect(await detailOf(response)).toBe("An article cannot be saved empty.");
  });

  it("refuses a body with no markdown at all", async () => {
    const h = harness();

    const response = await h.app.request(`/api/projects/${projectId}/article`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(400);
  });
});

describe("the image actions", () => {
  it("deletes one image and re-renders", async () => {
    const h = harness();

    const response = await h.app.request(`/api/projects/${projectId}/images/o-image-1`, {
      method: "DELETE",
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ redone: ["video"] });
  });

  // `logic/09` §Q75 and `logic/12`'s invariant, in the words the page shows.
  it("refuses the last image with the reason", async () => {
    const h = harness();
    await h.app.request(`/api/projects/${projectId}/images/o-image-1`, { method: "DELETE" });

    const response = await h.app.request(`/api/projects/${projectId}/images/o-image-2`, {
      method: "DELETE",
    });

    expect(response.status).toBe(409);
    expect(await detailOf(response)).toBe(
      "At least one image must remain, so the last one cannot be deleted.",
    );
  });

  it("answers 404 for an output that is not an image of this project", async () => {
    const h = harness();

    const response = await h.app.request(`/api/projects/${projectId}/images/o-md`, {
      method: "DELETE",
    });

    expect(response.status).toBe(404);
    expect(await detailOf(response)).toBe("This project has no image with that id.");
  });

  it("regenerates one image and re-renders", async () => {
    const h = harness();

    const response = await h.app.request(`/api/projects/${projectId}/images/o-image-1/regenerate`, {
      method: "POST",
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ redone: ["images", "video"] });
  });
});

describe("cancel", () => {
  it("aborts the project and never ticks it back into life", async () => {
    const h = harness({ audio: "running", video: "pending" });

    const response = await h.app.request(`/api/projects/${projectId}/cancel`, { method: "POST" });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      canceled: ["audio"],
      project: { status: "canceled" },
    });
    expect(h.aborted).toEqual([projectId]);
    // §Q111: "a canceled project never resumes on its own".
    expect(h.ticked).toEqual([]);
  });

  // Step 4: "a second click is a no-op".
  it("answers a second click without aborting anything", async () => {
    const h = harness({ audio: "canceled", video: "pending" });

    const response = await h.app.request(`/api/projects/${projectId}/cancel`, { method: "POST" });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ canceled: [] });
    expect(h.aborted).toEqual([]);
  });

  it("answers 404 for a project that does not exist", async () => {
    const h = harness();

    const response = await h.app.request("/api/projects/nope/cancel", { method: "POST" });

    expect(response.status).toBe(404);
  });
});
