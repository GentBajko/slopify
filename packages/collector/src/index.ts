import type { Aggregates, CollectorDb, CollectorEvent } from "./model.js";
import { deltasFor, emptyAggregates, ingestSchema, isAggregateKey, maxBodyBytes } from "./model.js";

export interface Env {
  readonly DB: CollectorDb;
}

// ceiling: 5000 events per machine per rolling hour, counted off the events table rather
// than held in a counter, so there is no second store to keep. A machine over the limit
// has its post accepted and dropped; the app marks the batch delivered and moves on,
// which is what keeps an abusive install from parking real events behind it. The upgrade
// is a Durable Object per machine when one query per request stops being cheap.
const eventsPerMachinePerHour = 5000;
const rateWindowMs = 60 * 60 * 1000;

// The page that reads the aggregates. Loopback is allowed too so the page can be opened
// against a local collector; the data is public and read-only either way.
const siteOrigin = "https://slopify.stream";
const loopback = /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d{1,5})?$/;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    try {
      if (request.method === "POST" && url.pathname === "/events") {
        return await ingest(request, env.DB);
      }
      if (request.method === "GET" && url.pathname === "/aggregates") {
        return answer(await totals(env.DB), 200, request);
      }
      return answer({ error: "no route" }, 404, request);
    } catch (error) {
      // The message is for the host's request log, never for the caller: this endpoint is
      // open to anyone and its internals are nobody's business.
      console.error("collector", error instanceof Error ? error.message : String(error));
      return answer({ error: "the collector could not handle that request" }, 500, request);
    }
  },
};

async function ingest(request: Request, db: CollectorDb): Promise<Response> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > maxBodyBytes) {
    return answer({ error: "the body is too large" }, 413, request);
  }
  const body = await request.text();
  // The header is a claim; the bytes are the fact.
  if (body.length > maxBodyBytes) {
    return answer({ error: "the body is too large" }, 413, request);
  }
  const parsed = ingestSchema.safeParse(json(body));
  if (!parsed.success) {
    return answer({ error: "the body is not a batch of events" }, 400, request);
  }

  const events = parsed.data.events;
  const machineId = events[0]?.machineId ?? "";
  const accepted = (await withinRate(db, machineId)) ? await store(db, events) : 0;
  return answer({ ok: true, accepted }, 200, request);
}

// The dedup rule: the event id is the primary key, so a batch re-sent after an ambiguous
// failure inserts nothing the second time, and only the insert that actually changed a row
// moves the aggregates.
async function store(db: CollectorDb, events: readonly CollectorEvent[]): Promise<number> {
  const receivedAt = new Date().toISOString();
  let accepted = 0;
  for (const event of events) {
    const result = await db
      .prepare(
        "INSERT OR IGNORE INTO events (id, machine_id, type, payload, received_at) VALUES (?, ?, ?, ?, ?)",
      )
      .bind(event.id, event.machineId, event.type, JSON.stringify(event.payload), receivedAt)
      .run();
    if (result.meta.changes !== 1) {
      continue;
    }
    accepted += 1;
    // ceiling: the insert and its aggregate bumps are separate statements, so a Worker killed
    // between them loses that event's contribution while the event itself stays stored.
    // Aggregates are best effort by design; the upgrade is a batch, which needs the dedup
    // decision to move into SQL.
    for (const [key, delta] of deltasFor(event)) {
      await db
        .prepare(
          "INSERT INTO aggregates (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = value + excluded.value",
        )
        .bind(key, delta)
        .run();
    }
  }
  return accepted;
}

async function withinRate(db: CollectorDb, machineId: string): Promise<boolean> {
  const since = new Date(Date.now() - rateWindowMs).toISOString();
  const { results } = await db
    .prepare("SELECT count(*) AS n FROM events WHERE machine_id = ? AND received_at > ?")
    .bind(machineId, since)
    .all<{ readonly n: number }>();
  return (results[0]?.n ?? 0) < eventsPerMachinePerHour;
}

async function totals(db: CollectorDb): Promise<{ readonly aggregates: Aggregates }> {
  const { results } = await db
    .prepare("SELECT key, value FROM aggregates")
    .all<{ readonly key: string; readonly value: number }>();
  const found: Record<string, number> = {};
  for (const row of results) {
    if (isAggregateKey(row.key)) {
      found[row.key] = row.value;
    }
  }
  // Every key is present at zero, so the page never has to tell a missing counter from a
  // real zero. Dashes are reserved for the collector being unreachable.
  return { aggregates: { ...emptyAggregates(), ...found } };
}

function answer(body: unknown, status: number, request: Request): Response {
  const origin = request.headers.get("origin") ?? "";
  return Response.json(body, {
    status,
    headers: {
      "access-control-allow-origin": loopback.test(origin) ? origin : siteOrigin,
      "cache-control": "no-store",
    },
  });
}

function json(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    // A body that is not JSON is a 400 like any other malformed batch, and the schema
    // below produces that answer from `undefined` without a second code path.
    return undefined;
  }
}
