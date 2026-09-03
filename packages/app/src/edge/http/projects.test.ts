import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import type { Clock } from "../../kernel/clock.js";
import { openDb } from "../../kernel/db/index.js";
import { migrate } from "../../kernel/db/migrate.js";
import type { Ids } from "../../kernel/ids.js";
import type { Log } from "../../kernel/log.js";
import { ensureDirs, layout } from "../../kernel/paths.js";
import type { RunDraft } from "../../slices/admission/model.js";
import { createHub } from "../events/hub.js";
import { createApp } from "./app.js";

const clock: Clock = { now: () => new Date("2026-09-02T10:00:00.000Z") };
const log: Log = { write: (): void => {} };

interface Harness {
  readonly app: ReturnType<typeof createApp>;
  readonly db: DatabaseSync;
  readonly ticked: string[];
}

function harness(): Harness {
  const paths = layout(mkdtempSync(join(tmpdir(), "slopify-projects-")));
  ensureDirs(paths, { mode: 0o700 });
  const db = openDb(paths.db);
  migrate(db, clock);
  let n = 0;
  const ids: Ids = {
    next: (): string => {
      n += 1;
      return `id${n}`;
    },
  };
  const ticked: string[] = [];
  const app = createApp({
    db,
    paths,
    hub: createHub({ ids, log }),
    runner: {
      // The real runner claims every eligible stage inside tick, before the response is
      // written; this fake does the one claim the skeleton run makes.
      tick: (projectId: string): void => {
        ticked.push(projectId);
        db.prepare(
          "UPDATE stages SET state = 'running' WHERE project_id = ? AND kind = 'video' AND state = 'pending'",
        ).run(projectId);
      },
      settled: async (): Promise<void> => {},
      abortAll: async (): Promise<void> => {},
    },
    clock,
    ids,
    log,
    version: "1.2.3",
    webDist: join(paths.dataDir, "missing"),
    flushSoon: (): void => {},
  });
  return { app, db, ticked };
}

async function stage(app: Harness["app"], kind: string, body: string): Promise<string> {
  const form = new FormData();
  form.set("file", new File([body], `${kind}.bin`));
  const response = await app.request(`/api/staging/${kind}`, { method: "POST", body: form });
  return ((await response.json()) as { id: string }).id;
}

function draft(over: Partial<RunDraft> = {}): RunDraft {
  return {
    title: "Rope Tricks",
    format: "16:9",
    sources: {
      research: "off",
      article: "provide",
      audio: "provide",
      images: "provide",
      thumbnail: "off",
      video: "generate",
    },
    imagePrompts: [],
    values: {},
    provided: { article: "The article." },
    silenceGapSeconds: 3,
    ...over,
  };
}

async function post(app: Harness["app"], body: unknown): Promise<Response> {
  return await app.request("/api/projects", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("POST /api/projects", () => {
  it("creates the project and hands it to the runner", async () => {
    const { app, ticked } = harness();
    const audio = await stage(app, "audio", "narration");
    const image = await stage(app, "images", "a picture");

    const response = await post(
      app,
      draft({ provided: { article: "The article.", audio, images: [image] } }),
    );

    expect(response.status).toBe(201);
    const created = (await response.json()) as {
      project: { id: string; status: string; title: string };
      stages: Array<{ kind: string; state: string }>;
    };
    expect(created.project.title).toBe("Rope Tricks");
    // The status and the stages are read from the same moment: the runner has already
    // claimed the video stage by the time the 201 is written.
    expect(created.project.status).toBe("running");
    expect(created.stages.map((row) => `${row.kind}:${row.state}`)).toEqual([
      "research:skipped",
      "article:provided",
      "audio:provided",
      "images:provided",
      "thumbnail:skipped",
      "video:running",
    ]);
    expect(ticked).toEqual([created.project.id]);
  });

  it("marks the failing fields rather than creating anything", async () => {
    const { app, db, ticked } = harness();

    const response = await post(app, draft({ title: "  " }));

    expect(response.status).toBe(400);
    expect(response.headers.get("content-type")).toBe("application/problem+json");
    expect(await response.json()).toMatchObject({
      status: 400,
      fields: [
        { field: "title", message: "A title is required." },
        { field: "provided.audio", message: "Pick an audio file." },
        { field: "provided.images", message: "Pick at least one image." },
      ],
    });
    expect(db.prepare("SELECT count(*) AS n FROM projects").get()).toEqual({ n: 0 });
    expect(ticked).toEqual([]);
  });

  it("refuses a body that is not a run configuration at all", async () => {
    const { app } = harness();

    const response = await post(app, { title: "Rope Tricks" });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ detail: /does not match this endpoint/ });
  });
});

describe("GET /api/projects", () => {
  it("lists what has been created, newest first, with the derived status", async () => {
    const { app, db } = harness();
    db.exec(
      'INSERT INTO projects VALUES (\'p1\',\'First\',\'16:9\',\'{"title":"First","format":"16:9","sources":{"research":"off","article":"provide","audio":"provide","images":"provide","thumbnail":"off","video":"generate"},"imagePrompts":[],"values":{},"provided":{},"silenceGapSeconds":3,"rendered":{}}\',\'2026-09-01\',\'2026-09-01\')',
    );
    db.exec(
      'INSERT INTO projects VALUES (\'p2\',\'Second\',\'9:16\',\'{"title":"Second","format":"9:16","sources":{"research":"off","article":"provide","audio":"provide","images":"provide","thumbnail":"off","video":"generate"},"imagePrompts":[],"values":{},"provided":{},"silenceGapSeconds":3,"rendered":{}}\',\'2026-09-02\',\'2026-09-02\')',
    );
    db.exec(
      "INSERT INTO stages (id, project_id, kind, source, state) VALUES ('s1','p1','video','generate','failed')",
    );

    const response = await app.request("/api/projects");

    expect(response.status).toBe(200);
    expect((await response.json()) as { projects: Array<{ id: string; status: string }> }).toEqual({
      projects: [
        expect.objectContaining({ id: "p2", status: "pending" }),
        expect.objectContaining({ id: "p1", status: "failed" }),
      ],
    });
  });

  it("lists nothing before anything is created", async () => {
    const { app } = harness();
    expect(await (await app.request("/api/projects")).json()).toEqual({ projects: [] });
  });
});

describe("GET /api/projects/:id", () => {
  it("answers with the project, its stages, and its outputs", async () => {
    const { app } = harness();
    const audio = await stage(app, "audio", "narration");
    const image = await stage(app, "images", "a picture");
    const created = (await (
      await post(app, draft({ provided: { article: "The article.", audio, images: [image] } }))
    ).json()) as { project: { id: string } };

    const response = await app.request(`/api/projects/${created.project.id}`);

    expect(response.status).toBe(200);
    const read = (await response.json()) as {
      project: { id: string; status: string };
      stages: unknown[];
      outputs: Array<{ role: string; path: string }>;
    };
    expect(read.project.id).toBe(created.project.id);
    expect(read.stages).toHaveLength(6);
    expect(read.outputs.map((output) => `${output.role}:${output.path}`)).toEqual([
      "article_txt:article.txt",
      "audio_body:audio-body.bin",
      "image:images/001.bin",
    ]);
  });

  it("says so when no project has that id", async () => {
    const { app } = harness();

    const response = await app.request("/api/projects/nope");

    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toBe("application/problem+json");
  });
});
