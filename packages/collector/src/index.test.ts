import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import worker from "./index.js";
import type { CollectorDb, CollectorStatement } from "./model.js";
import { maxBodyBytes, maxEventsPerRequest } from "./model.js";

// A stand-in for the D1 binding over the same engine D1 runs, built to the CollectorDb
// port the Worker declares rather than to a mock of it. `wrangler dev` against real local
// D1 is what proves the port matches; this makes the rules cheap to exercise.
function d1(): CollectorDb & { readonly db: DatabaseSync } {
  const db = new DatabaseSync(":memory:");
  db.exec(readFileSync(new URL("../schema.sql", import.meta.url), "utf8"));
  const statement = (query: string, values: readonly unknown[]): CollectorStatement => ({
    bind: (...bound: readonly unknown[]): CollectorStatement => statement(query, bound),
    run: async () => ({
      meta: { changes: Number(db.prepare(query).run(...asParams(values)).changes) },
    }),
    all: async <T>() => ({ results: db.prepare(query).all(...asParams(values)) as T[] }),
  });
  return { db, prepare: (query: string): CollectorStatement => statement(query, []) };
}

function asParams(values: readonly unknown[]): (string | number | null)[] {
  return values.map((value) => {
    if (typeof value === "string" || typeof value === "number" || value === null) {
      return value;
    }
    throw new Error(`the stand-in was bound a ${typeof value}`);
  });
}

const machineId = "7b1f0d2e-0000-4000-8000-000000000000";

function event(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "e1",
    machineId,
    type: "stage.completed",
    payload: { appVersion: "1.2.3", stage: "video" },
    createdAt: "2026-09-02T10:00:00.000Z",
    ...overrides,
  };
}

function post(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("https://collector.slopify.stream/events", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function get(path: string, headers: Record<string, string> = {}): Request {
  return new Request(`https://collector.slopify.stream${path}`, { headers });
}

async function aggregatesOf(db: CollectorDb): Promise<Record<string, number>> {
  const response = await worker.fetch(get("/aggregates"), { DB: db });
  const body = (await response.json()) as { aggregates: Record<string, number> };
  return body.aggregates;
}

describe("POST /events", () => {
  // The dedup rule, logic/16 §Q134: the same event posted twice counts once.
  it("counts an event once however many times it is posted", async () => {
    const db = d1();
    const batch = { events: [event()] };

    const first = await worker.fetch(post(batch), { DB: db });
    const second = await worker.fetch(post(batch), { DB: db });

    expect(await first.json()).toEqual({ ok: true, accepted: 1 });
    expect(await second.json()).toEqual({ ok: true, accepted: 0 });
    expect(await aggregatesOf(db)).toMatchObject({ videos_made: 1 });
    expect(db.db.prepare("SELECT count(*) AS n FROM events").get()).toEqual({ n: 1 });
  });

  it("counts an id repeated inside one batch once", async () => {
    const db = d1();

    const response = await worker.fetch(post({ events: [event(), event()] }), { DB: db });

    expect(await response.json()).toEqual({ ok: true, accepted: 1 });
    expect(await aggregatesOf(db)).toMatchObject({ videos_made: 1 });
  });

  it("sums the counters an event carries", async () => {
    const db = d1();

    await worker.fetch(
      post({
        events: [
          event({ id: "e1", type: "install", payload: { appVersion: "1.2.3" } }),
          event({ id: "e2", type: "project.created", payload: { appVersion: "1.2.3" } }),
          event({
            id: "e3",
            payload: {
              appVersion: "1.2.3",
              stage: "images",
              images: 4,
              tokensIn: 10,
              tokensOut: 5,
            },
          }),
          event({
            id: "e4",
            payload: { appVersion: "1.2.3", stage: "audio", segment: "body", audioSeconds: 12.6 },
          }),
          event({ id: "e5", payload: { appVersion: "1.2.3", stage: "thumbnail" } }),
        ],
      }),
      { DB: db },
    );

    expect(await aggregatesOf(db)).toEqual({
      installs: 1,
      projects_created: 1,
      videos_made: 0,
      images_made: 4,
      thumbnails_made: 1,
      audio_seconds: 13,
      tokens_used: 15,
    });
  });

  it("stores an event type it does not know without moving any counter", async () => {
    const db = d1();

    const response = await worker.fetch(post({ events: [event({ type: "stage.retried" })] }), {
      DB: db,
    });

    expect(await response.json()).toEqual({ ok: true, accepted: 1 });
    expect(Object.values(await aggregatesOf(db)).every((value) => value === 0)).toBe(true);
  });

  it.each([
    ["a body that is not JSON", "not json at all"],
    ["a body that is not an object", JSON.stringify([1, 2, 3])],
    ["a batch with no events", JSON.stringify({ events: [] })],
    ["an event with no id", JSON.stringify({ events: [{ ...event(), id: undefined }] })],
    ["an event with no machine id", JSON.stringify({ events: [{ ...event(), machineId: "" }] })],
    ["a numeric type", JSON.stringify({ events: [event({ type: 7 })] })],
    ["a payload that is not an object", JSON.stringify({ events: [event({ payload: "x" })] })],
    [
      "a payload carrying a document",
      JSON.stringify({ events: [event({ payload: { article: "a".repeat(201) } })] }),
    ],
    [
      "a payload nesting an object",
      JSON.stringify({ events: [event({ payload: { meta: { key: "sk-live" } } })] }),
    ],
    ["a createdAt that is not a date", JSON.stringify({ events: [event({ createdAt: "today" })] })],
    ["an id with a path in it", JSON.stringify({ events: [event({ id: "../../etc/passwd" })] })],
  ])("refuses %s with a 400", async (_label, body) => {
    const db = d1();

    const response = await worker.fetch(post(body), { DB: db });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "the body is not a batch of events" });
    expect(db.db.prepare("SELECT count(*) AS n FROM events").get()).toEqual({ n: 0 });
  });

  // Ten thousand events is over a megabyte, so the byte cap is what answers first. Either
  // way the post is refused cleanly and nothing is stored.
  it("refuses ten thousand events in one post", async () => {
    const db = d1();
    const events = Array.from({ length: 10_000 }, (_, n) => event({ id: `e${n}` }));

    const response = await worker.fetch(post({ events }), { DB: db });

    expect(response.status).toBe(413);
    expect(db.db.prepare("SELECT count(*) AS n FROM events").get()).toEqual({ n: 0 });
  });

  it("refuses one event more than the batch cap", async () => {
    const db = d1();
    const events = Array.from({ length: maxEventsPerRequest + 1 }, (_, n) =>
      event({ id: `e${n}` }),
    );

    const response = await worker.fetch(post({ events }), { DB: db });

    expect(response.status).toBe(400);
    expect(db.db.prepare("SELECT count(*) AS n FROM events").get()).toEqual({ n: 0 });
  });

  it("takes a full batch at the cap", async () => {
    const db = d1();
    const events = Array.from({ length: maxEventsPerRequest }, (_, n) =>
      event({ id: `e${n}`, payload: { appVersion: "1.2.3", stage: "video" } }),
    );

    const response = await worker.fetch(post({ events }), { DB: db });

    expect(await response.json()).toEqual({ ok: true, accepted: maxEventsPerRequest });
  });

  it("refuses a body over the size cap before parsing it", async () => {
    const db = d1();
    const events = [event({ payload: { appVersion: "1.2.3", note: "x".repeat(200) } })];

    const response = await worker.fetch(
      post(`${JSON.stringify({ events })}${" ".repeat(maxBodyBytes)}`),
      { DB: db },
    );

    expect(response.status).toBe(413);
    expect(db.db.prepare("SELECT count(*) AS n FROM events").get()).toEqual({ n: 0 });
  });

  it("refuses a body whose declared length is over the cap", async () => {
    const db = d1();

    const response = await worker.fetch(
      post({ events: [event()] }, { "content-length": String(maxBodyBytes + 1) }),
      { DB: db },
    );

    expect(response.status).toBe(413);
  });

  it("refuses a post that mixes machines", async () => {
    const db = d1();
    const events = [event(), event({ id: "e2", machineId: "another-machine" })];

    expect((await worker.fetch(post({ events }), { DB: db })).status).toBe(400);
  });

  it("drops a machine's events once it is over the hourly limit", async () => {
    const db = d1();
    const insert = db.db.prepare(
      "INSERT INTO events (id, machine_id, type, payload, received_at) VALUES (?, ?, 'stage.completed', '{}', ?)",
    );
    const now = new Date().toISOString();
    for (let n = 0; n < 5000; n += 1) {
      insert.run(`old${n}`, machineId, now);
    }

    const response = await worker.fetch(post({ events: [event()] }), { DB: db });

    expect(await response.json()).toEqual({ ok: true, accepted: 0 });
    expect(await aggregatesOf(db)).toMatchObject({ videos_made: 0 });
  });

  it("does not count another machine's events against this one", async () => {
    const db = d1();
    const insert = db.db.prepare(
      "INSERT INTO events (id, machine_id, type, payload, received_at) VALUES (?, 'noisy-neighbour', 'stage.completed', '{}', ?)",
    );
    const now = new Date().toISOString();
    for (let n = 0; n < 5000; n += 1) {
      insert.run(`old${n}`, now);
    }

    const response = await worker.fetch(post({ events: [event()] }), { DB: db });

    expect(await response.json()).toEqual({ ok: true, accepted: 1 });
  });
});

describe("GET /aggregates", () => {
  it("answers every counter at zero before anything arrives", async () => {
    expect(await aggregatesOf(d1())).toEqual({
      installs: 0,
      projects_created: 0,
      videos_made: 0,
      images_made: 0,
      thumbnails_made: 0,
      audio_seconds: 0,
      tokens_used: 0,
    });
  });

  it("ignores a key the schema does not know", async () => {
    const db = d1();
    db.db.prepare("INSERT INTO aggregates (key, value) VALUES ('mystery', 9)").run();

    expect(await aggregatesOf(db)).not.toHaveProperty("mystery");
  });

  it("lets the site read it, and a local page too", async () => {
    const db = d1();

    const site = await worker.fetch(get("/aggregates"), { DB: db });
    const local = await worker.fetch(get("/aggregates", { origin: "http://localhost:8788" }), {
      DB: db,
    });
    const other = await worker.fetch(get("/aggregates", { origin: "https://evil.example" }), {
      DB: db,
    });

    expect(site.headers.get("access-control-allow-origin")).toBe("https://slopify.stream");
    expect(local.headers.get("access-control-allow-origin")).toBe("http://localhost:8788");
    expect(other.headers.get("access-control-allow-origin")).toBe("https://slopify.stream");
  });
});

describe("anything else", () => {
  it("is a 404", async () => {
    const response = await worker.fetch(get("/admin"), { DB: d1() });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "no route" });
  });

  it("does not accept events over GET", async () => {
    expect((await worker.fetch(get("/events"), { DB: d1() })).status).toBe(404);
  });

  it("says nothing about itself when the database fails", async () => {
    const broken: CollectorDb = {
      prepare: () => {
        throw new Error("D1_ERROR: no such table: events at /var/lib/d1/slopify.sqlite");
      },
    };

    const response = await worker.fetch(post({ events: [event()] }), { DB: broken });

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: "the collector could not handle that request",
    });
  });
});
