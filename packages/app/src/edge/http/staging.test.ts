import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { createHub } from "../../edge/events/hub.js";
import type { Clock } from "../../kernel/clock.js";
import { openDb } from "../../kernel/db/index.js";
import { migrate } from "../../kernel/db/migrate.js";
import type { Ids } from "../../kernel/ids.js";
import type { Log } from "../../kernel/log.js";
import type { Paths } from "../../kernel/paths.js";
import { ensureDirs, layout } from "../../kernel/paths.js";
import type { GlobalEvent } from "../events/hub.js";
import { createApp } from "./app.js";

const clock: Clock = { now: () => new Date("2026-09-02T10:00:00.000Z") };
const log: Log = { write: (): void => {} };

interface Harness {
  readonly app: ReturnType<typeof createApp>;
  readonly db: DatabaseSync;
  readonly paths: Paths;
  readonly events: GlobalEvent[];
}

function harness(): Harness {
  const paths = layout(mkdtempSync(join(tmpdir(), "slopify-upload-")));
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
  const hub = createHub({ ids, log });
  const events: GlobalEvent[] = [];
  const app = createApp({
    db,
    paths,
    hub: {
      ...hub,
      emitGlobal: (event: GlobalEvent): void => {
        events.push(event);
      },
    },
    clock,
    runner: {
      tick: (): void => {},
      settled: async (): Promise<void> => {},
      abortAll: async (): Promise<void> => {},
    },
    ids,
    log,
    version: "1.2.3",
    webDist: join(paths.dataDir, "missing"),
    flushSoon: (): void => {},
    // These routes never probe; the CLI status routes carry their own harness.
    probe: () => Promise.resolve({ ran: false, stdout: "" }),
  });
  return { app, db, paths, events };
}

function upload(body: string, filename: string): FormData {
  const form = new FormData();
  form.set("file", new File([body], filename));
  return form;
}

describe("POST /api/staging/:kind", () => {
  it("stages the uploaded file and reports its progress on the global channel", async () => {
    const { app, paths, events } = harness();

    const response = await app.request("/api/staging/audio", {
      method: "POST",
      body: upload("narration bytes", "Take One.mp3"),
    });

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      id: "id1",
      stageKind: "audio",
      path: "id1",
      originalFilename: "Take One.mp3",
      bytes: 15,
      state: "staged",
      createdAt: "2026-09-02T10:00:00.000Z",
    });
    expect(readFileSync(join(paths.staging, "id1"), "utf8")).toBe("narration bytes");
    expect(events.at(-1)).toMatchObject({ type: "staging.progress", state: "staged", bytes: 15 });
  });

  it("refuses a stage whose content is pasted text or always generated", async () => {
    const { app } = harness();

    const response = await app.request("/api/staging/research", {
      method: "POST",
      body: upload("notes", "notes.txt"),
    });

    expect(response.status).toBe(400);
    expect(response.headers.get("content-type")).toBe("application/problem+json");
  });

  it("refuses a filename carrying a path", async () => {
    const { app, db } = harness();

    const response = await app.request("/api/staging/images", {
      method: "POST",
      body: upload("png", "../../etc/passwd"),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ status: 400, detail: /path separator/ });
    expect(db.prepare("SELECT count(*) AS n FROM staged_files").get()).toEqual({ n: 0 });
  });

  it("refuses a body that is not multipart", async () => {
    const { app } = harness();

    const response = await app.request("/api/staging/audio", {
      method: "POST",
      body: "raw bytes",
      headers: { "content-type": "application/octet-stream" },
    });

    expect(response.status).toBe(415);
  });

  it("refuses a multipart body with no file part", async () => {
    const { app } = harness();
    const form = new FormData();
    form.set("stage", "audio");

    const response = await app.request("/api/staging/audio", { method: "POST", body: form });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ detail: /no file part/ });
  });

  it("refuses an empty file", async () => {
    const { app } = harness();

    const response = await app.request("/api/staging/thumbnail", {
      method: "POST",
      body: upload("", "empty.png"),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ detail: /empty/ });
  });
});

describe("GET /api/staging", () => {
  it("lists what is staged", async () => {
    const { app } = harness();
    await app.request("/api/staging/images", { method: "POST", body: upload("a", "one.png") });
    await app.request("/api/staging/images", { method: "POST", body: upload("bb", "two.png") });

    const response = await app.request("/api/staging");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      files: [
        expect.objectContaining({ id: "id1", originalFilename: "one.png", bytes: 1 }),
        expect.objectContaining({ id: "id2", originalFilename: "two.png", bytes: 2 }),
      ],
    });
  });
});

describe("DELETE /api/staging/:id", () => {
  it("discards a staged file the user removed from the form", async () => {
    const { app, paths } = harness();
    await app.request("/api/staging/images", { method: "POST", body: upload("a", "one.png") });

    const response = await app.request("/api/staging/id1", { method: "DELETE" });

    expect(response.status).toBe(204);
    expect(existsSync(join(paths.staging, "id1"))).toBe(false);
  });

  it("says so when the id was never staged", async () => {
    const { app } = harness();

    const response = await app.request("/api/staging/nope", { method: "DELETE" });

    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toBe("application/problem+json");
  });
});
