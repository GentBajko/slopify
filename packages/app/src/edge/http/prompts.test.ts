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
import { createHub } from "../events/hub.js";
import { createApp } from "./app.js";

const clock = fixedClock("2026-09-02T10:00:00.000Z");
const log: Log = { write: (): void => {} };

interface Harness {
  readonly app: ReturnType<typeof createApp>;
  readonly db: DatabaseSync;
}

function harness(): Harness {
  const paths = layout(mkdtempSync(join(tmpdir(), "slopify-prompts-")));
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
  return { app, db };
}

async function send(
  app: Harness["app"],
  method: string,
  path: string,
  body?: unknown,
): Promise<Response> {
  return await app.request(path, {
    method,
    ...(body === undefined
      ? {}
      : { body: JSON.stringify(body), headers: { "content-type": "application/json" } }),
  });
}

interface ProblemBody {
  readonly title: string;
  readonly detail: string;
  readonly fields?: ReadonlyArray<{ field: string; message: string }>;
}

describe("POST /api/prompts", () => {
  it("stores a prompt with its detected slots", async () => {
    const { app } = harness();

    const response = await send(app, "POST", "/api/prompts", {
      kind: "article",
      name: "  Documentary dossier ",
      body: "Compose a dossier on {{topic}}.",
    });

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      id: "id1",
      kind: "article",
      name: "Documentary dossier",
      body: "Compose a dossier on {{topic}}.",
      slots: ["topic"],
      updatedAt: "2026-09-02T10:00:00.000Z",
    });
  });

  // Verification 3: the lint blocks the save and the problem names what is wrong and
  // where, under the `fields[]` member the editor marks its inputs from.
  it("refuses a malformed slot with a 400 naming the fault and its position", async () => {
    const { app } = harness();

    const response = await send(app, "POST", "/api/prompts", {
      kind: "article",
      name: "Broken",
      body: "line one\nabout {{topic",
    });

    expect(response.status).toBe(400);
    expect(response.headers.get("content-type")).toBe("application/problem+json");
    expect(await response.json()).toMatchObject({
      title: "Bad Request",
      fields: [{ field: "body", message: "The `{{` at line 2, column 7 is never closed." }],
    });
    expect(await (await send(app, "GET", "/api/prompts")).json()).toEqual({ prompts: [] });
  });

  it("refuses a blank name", async () => {
    const { app } = harness();

    const response = await send(app, "POST", "/api/prompts", {
      kind: "article",
      name: " ",
      body: "b",
    });

    expect(response.status).toBe(400);
    expect(((await response.json()) as ProblemBody).fields).toEqual([
      { field: "name", message: "A name is required." },
    ]);
  });

  it("refuses a kind this build does not know before the slice sees it", async () => {
    const { app } = harness();

    const response = await send(app, "POST", "/api/prompts", {
      kind: "haiku",
      name: "N",
      body: "b",
    });

    expect(response.status).toBe(400);
    expect(((await response.json()) as ProblemBody).detail).toBe(
      "The request does not match this endpoint's schema.",
    );
  });

  // Verification 2: same name, same kind, differing only by case.
  it("refuses a name already taken in that kind, whatever its case", async () => {
    const { app } = harness();
    await send(app, "POST", "/api/prompts", { kind: "article", name: "Dossier", body: "b" });

    const response = await send(app, "POST", "/api/prompts", {
      kind: "article",
      name: "DOSSIER",
      body: "b",
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      title: "Conflict",
      fields: [{ field: "name", message: "Another prompt already has this name." }],
    });
  });

  it("allows the same name under another kind", async () => {
    const { app } = harness();
    await send(app, "POST", "/api/prompts", { kind: "article", name: "Dossier", body: "b" });

    const response = await send(app, "POST", "/api/prompts", {
      kind: "image",
      name: "dossier",
      body: "b",
    });

    expect(response.status).toBe(201);
  });
});

describe("GET /api/prompts", () => {
  // `logic/15` step 5: sorted by name; every kind in one list, filtered by the tab.
  it("lists every kind sorted by name", async () => {
    const { app } = harness();
    await send(app, "POST", "/api/prompts", { kind: "article", name: "zebra", body: "b" });
    await send(app, "POST", "/api/prompts", { kind: "image", name: "Apple", body: "b" });

    const body = (await (await send(app, "GET", "/api/prompts")).json()) as {
      prompts: Array<{ name: string }>;
    };

    expect(body.prompts.map((prompt) => prompt.name)).toEqual(["Apple", "zebra"]);
  });
});

describe("PUT /api/prompts/:id", () => {
  it("overwrites the body and the stored slots", async () => {
    const { app } = harness();
    await send(app, "POST", "/api/prompts", {
      kind: "article",
      name: "Dossier",
      body: "{{topic}} {{era}}",
    });

    const response = await send(app, "PUT", "/api/prompts/id1", {
      kind: "thumbnail",
      name: "Dossier card",
      body: "{{era}} only",
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      id: "id1",
      kind: "thumbnail",
      name: "Dossier card",
      slots: ["era"],
    });
  });

  it("answers 404 for an id that is not there", async () => {
    const { app } = harness();

    const response = await send(app, "PUT", "/api/prompts/nope", {
      kind: "article",
      name: "N",
      body: "b",
    });

    expect(response.status).toBe(404);
    expect(((await response.json()) as ProblemBody).detail).toBe("No prompt has that id.");
  });

  it("refuses an id shaped like anything but an id", async () => {
    const { app } = harness();

    const response = await send(app, "PUT", "/api/prompts/..%2Fetc", {
      kind: "article",
      name: "N",
      body: "b",
    });

    expect(response.status).toBe(400);
  });
});

describe("DELETE /api/prompts/:id", () => {
  it("removes the prompt", async () => {
    const { app } = harness();
    await send(app, "POST", "/api/prompts", { kind: "article", name: "Dossier", body: "b" });

    expect((await send(app, "DELETE", "/api/prompts/id1")).status).toBe(204);
    expect(await (await send(app, "GET", "/api/prompts")).json()).toEqual({ prompts: [] });
  });

  it("answers 404 for an id that is not there", async () => {
    const { app } = harness();

    expect((await send(app, "DELETE", "/api/prompts/nope")).status).toBe(404);
  });
});
