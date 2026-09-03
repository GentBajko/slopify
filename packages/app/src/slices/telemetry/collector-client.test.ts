import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import type { CollectorEvent } from "./collector-client.js";
import { collectorEndpoint, defaultCollectorUrl, httpPostEvents } from "./collector-client.js";

const running: Server[] = [];

afterEach(async () => {
  for (const server of running.splice(0)) {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

const event: CollectorEvent = {
  id: "e1",
  machineId: "7b1f0d2e-0000-4000-8000-000000000000",
  type: "stage.completed",
  payload: { appVersion: "1.2.3", stage: "video" },
  createdAt: "2026-09-02T10:00:00.000Z",
};

interface Fake {
  readonly url: string;
  readonly bodies: string[];
  readonly paths: string[];
}

function collector(reply: (n: number) => { status: number; delayMs?: number }): Promise<Fake> {
  const bodies: string[] = [];
  const paths: string[] = [];
  const server = createServer((request, response) => {
    paths.push(request.url ?? "");
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      bodies.push(Buffer.concat(chunks).toString("utf8"));
      const answer = reply(bodies.length);
      setTimeout(() => {
        response.writeHead(answer.status, { "content-type": "application/json" });
        response.end("{}");
      }, answer.delayMs ?? 0);
    });
  });
  running.push(server);
  return new Promise<Fake>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = address === null || typeof address === "string" ? 0 : address.port;
      resolve({ url: `http://127.0.0.1:${port}`, bodies, paths });
    });
  });
}

describe("httpPostEvents", () => {
  it("posts the batch as JSON to /events and reports success", async () => {
    const fake = await collector(() => ({ status: 200 }));

    const outcome = await httpPostEvents(fake.url, 5_000)([event]);

    expect(outcome).toEqual({ ok: true });
    expect(fake.paths).toEqual(["/events"]);
    expect(JSON.parse(fake.bodies[0] ?? "")).toEqual({ events: [event] });
  });

  it("treats a server error as retriable, so the queue keeps the events", async () => {
    const fake = await collector(() => ({ status: 503 }));

    expect(await httpPostEvents(fake.url, 5_000)([event])).toEqual({
      ok: false,
      retriable: true,
      reason: "the collector answered 503",
    });
  });

  it("treats being rate limited as retriable", async () => {
    const fake = await collector(() => ({ status: 429 }));

    expect(await httpPostEvents(fake.url, 5_000)([event])).toMatchObject({
      ok: false,
      retriable: true,
    });
  });

  // A batch the collector calls malformed will be called malformed forever, and the queue
  // is unbounded, so retrying it would wedge every later event behind it.
  it("treats a rejected batch as not retriable", async () => {
    const fake = await collector(() => ({ status: 400 }));

    expect(await httpPostEvents(fake.url, 5_000)([event])).toEqual({
      ok: false,
      retriable: false,
      reason: "the collector answered 400",
    });
  });

  it("reports an unreachable collector as retriable rather than throwing", async () => {
    const outcome = await httpPostEvents("http://127.0.0.1:1", 5_000)([event]);

    expect(outcome.ok).toBe(false);
    expect(outcome).toMatchObject({ retriable: true });
  });

  it("gives up on a collector that never answers", async () => {
    const fake = await collector(() => ({ status: 200, delayMs: 2_000 }));

    expect(await httpPostEvents(fake.url, 50)([event])).toMatchObject({
      ok: false,
      retriable: true,
    });
  });

  it("posts nothing when the batch is empty", async () => {
    const fake = await collector(() => ({ status: 200 }));

    expect(await httpPostEvents(fake.url, 5_000)([])).toEqual({ ok: true });
    expect(fake.bodies).toEqual([]);
  });
});

describe("collectorEndpoint", () => {
  it("is the built-in URL when nothing overrides it", () => {
    expect(collectorEndpoint({})).toBe(defaultCollectorUrl);
  });

  it("takes the override and drops its trailing slash", () => {
    expect(collectorEndpoint({ SLOPIFY_COLLECTOR_URL: "http://127.0.0.1:8787/" })).toBe(
      "http://127.0.0.1:8787",
    );
  });

  it("ignores an override that is not an http URL", () => {
    expect(collectorEndpoint({ SLOPIFY_COLLECTOR_URL: "file:///etc/passwd" })).toBe(
      defaultCollectorUrl,
    );
    expect(collectorEndpoint({ SLOPIFY_COLLECTOR_URL: "not a url" })).toBe(defaultCollectorUrl);
    expect(collectorEndpoint({ SLOPIFY_COLLECTOR_URL: "  " })).toBe(defaultCollectorUrl);
  });
});
