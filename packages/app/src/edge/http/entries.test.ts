import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

type App = ReturnType<typeof createApp>;

function harness(): App {
  const paths = layout(mkdtempSync(join(tmpdir(), "slopify-entries-")));
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
  return createApp({
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
}

async function send(app: App, method: string, path: string, body?: unknown): Promise<Response> {
  return await app.request(path, {
    method,
    ...(body === undefined
      ? {}
      : { body: JSON.stringify(body), headers: { "content-type": "application/json" } }),
  });
}

// §Q98: an intro or outro is either narrated verbatim (Text) or written by the LLM from
// the entry as instruction (LLM). §Q121 gives both the prompt library's rule set.
describe("POST /api/entries", () => {
  it("stores a text entry with its detected slots", async () => {
    const app = harness();

    const response = await send(app, "POST", "/api/entries", {
      category: "intro",
      mode: "text",
      name: "Welcome",
      body: "Today we look at {{topic}}.",
    });

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      id: "id1",
      category: "intro",
      mode: "text",
      name: "Welcome",
      body: "Today we look at {{topic}}.",
      slots: ["topic"],
      updatedAt: "2026-09-02T10:00:00.000Z",
    });
  });

  it("stores an LLM entry", async () => {
    const app = harness();

    const response = await send(app, "POST", "/api/entries", {
      category: "outro",
      mode: "llm",
      name: "Sign off",
      body: "Write a closing line about {{topic}}.",
    });

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ mode: "llm", category: "outro" });
  });

  it("refuses a malformed slot", async () => {
    const app = harness();

    const response = await send(app, "POST", "/api/entries", {
      category: "intro",
      mode: "text",
      name: "Broken",
      body: "a {{}} b",
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      fields: [{ field: "body", message: "The slot at line 1, column 3 has no name." }],
    });
  });

  it("refuses a name already taken in that category, whatever its case", async () => {
    const app = harness();
    await send(app, "POST", "/api/entries", {
      category: "intro",
      mode: "text",
      name: "Welcome",
      body: "Hi.",
    });

    const response = await send(app, "POST", "/api/entries", {
      category: "intro",
      mode: "llm",
      name: "welcome",
      body: "Hi.",
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      fields: [{ field: "name", message: "Another entry already has this name." }],
    });
  });

  it("allows the same name under the other category", async () => {
    const app = harness();
    await send(app, "POST", "/api/entries", {
      category: "intro",
      mode: "text",
      name: "Welcome",
      body: "Hi.",
    });

    const response = await send(app, "POST", "/api/entries", {
      category: "outro",
      mode: "text",
      name: "Welcome",
      body: "Bye.",
    });

    expect(response.status).toBe(201);
  });

  it("refuses a mode this build does not know before the slice sees it", async () => {
    const app = harness();

    const response = await send(app, "POST", "/api/entries", {
      category: "intro",
      mode: "song",
      name: "N",
      body: "b",
    });

    expect(response.status).toBe(400);
  });
});

describe("GET /api/entries", () => {
  it("lists both categories sorted by name", async () => {
    const app = harness();
    await send(app, "POST", "/api/entries", {
      category: "outro",
      mode: "text",
      name: "zebra",
      body: "b",
    });
    await send(app, "POST", "/api/entries", {
      category: "intro",
      mode: "text",
      name: "Apple",
      body: "b",
    });

    const body = (await (await send(app, "GET", "/api/entries")).json()) as {
      entries: Array<{ name: string }>;
    };

    expect(body.entries.map((entry) => entry.name)).toEqual(["Apple", "zebra"]);
  });
});

describe("PUT and DELETE /api/entries/:id", () => {
  it("switches an entry's mode", async () => {
    const app = harness();
    await send(app, "POST", "/api/entries", {
      category: "intro",
      mode: "text",
      name: "Welcome",
      body: "Hi.",
    });

    const response = await send(app, "PUT", "/api/entries/id1", {
      category: "intro",
      mode: "llm",
      name: "Welcome",
      body: "Write a greeting.",
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ mode: "llm" });
  });

  it("removes an entry", async () => {
    const app = harness();
    await send(app, "POST", "/api/entries", {
      category: "intro",
      mode: "text",
      name: "Welcome",
      body: "Hi.",
    });

    expect((await send(app, "DELETE", "/api/entries/id1")).status).toBe(204);
    expect(await (await send(app, "GET", "/api/entries")).json()).toEqual({ entries: [] });
  });

  it("answers 404 for an id that is not there", async () => {
    const app = harness();

    expect((await send(app, "DELETE", "/api/entries/nope")).status).toBe(404);
    expect(
      (
        await send(app, "PUT", "/api/entries/nope", {
          category: "intro",
          mode: "text",
          name: "N",
          body: "b",
        })
      ).status,
    ).toBe(404);
  });
});
