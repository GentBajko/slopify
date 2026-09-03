import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ServerType } from "@hono/node-server";
import { serve } from "@hono/node-server";
import { describe, expect, it, vi } from "vitest";
import type { Clock } from "../../kernel/clock.js";
import { openDb } from "../../kernel/db/index.js";
import { migrate } from "../../kernel/db/migrate.js";
import type { Ids } from "../../kernel/ids.js";
import type { Log, LogFields, LogLevel } from "../../kernel/log.js";
import { ensureDirs, layout } from "../../kernel/paths.js";
import type { Hub } from "../events/hub.js";
import { createHub } from "../events/hub.js";
import { createApp } from "./app.js";

interface Recorded {
  readonly level: LogLevel;
  readonly event: string;
  readonly detail: string | undefined;
}

function counter(): Ids {
  let n = 0;
  return {
    next: (): string => {
      n += 1;
      return `id${n}`;
    },
  };
}

function ticking(): Clock {
  let ms = 1_000;
  return {
    now: (): Date => {
      ms += 500;
      return new Date(ms);
    },
  };
}

function missingDir(): string {
  return join(mkdtempSync(join(tmpdir(), "slopify-web-")), "missing");
}

function built(): { app: ReturnType<typeof createApp>; hub: Hub; lines: Recorded[] } {
  return harness(missingDir());
}

function harness(
  webDist: string,
  wrap: (hub: Hub) => Hub = (hub) => hub,
): {
  app: ReturnType<typeof createApp>;
  hub: Hub;
  lines: Recorded[];
} {
  const lines: Recorded[] = [];
  const log: Log = {
    write: (level: LogLevel, event: string, fields?: LogFields): void => {
      lines.push({ level, event, detail: fields?.detail });
    },
  };
  const ids = counter();
  const hub = createHub({ ids, log });
  const clock = ticking();
  const paths = layout(mkdtempSync(join(tmpdir(), "slopify-app-")));
  ensureDirs(paths, { mode: 0o700 });
  const db = openDb(paths.db);
  migrate(db, clock);
  const app = createApp({
    db,
    paths,
    hub: wrap(hub),
    clock,
    runner: {
      tick: (): void => {},
      settled: async (): Promise<void> => {},
      abortAll: async (): Promise<void> => {},
    },
    ids,
    log,
    version: "1.2.3",
    webDist,
    flushSoon: (): void => {},
  });
  return { app, hub, lines };
}

function withSpa(): ReturnType<typeof harness> {
  const webDist = mkdtempSync(join(tmpdir(), "slopify-spa-"));
  mkdirSync(join(webDist, "assets"));
  writeFileSync(join(webDist, "index.html"), "<!doctype html><title>Slopify</title>");
  writeFileSync(join(webDist, "assets", "app.js"), "console.log('spa')");
  return harness(webDist);
}

function spied(): { app: ReturnType<typeof createApp>; closed: () => boolean } {
  let done = false;
  const { app } = harness(missingDir(), (hub) => ({
    ...hub,
    subscribeGlobal: async (stream, signal): Promise<void> => {
      await hub.subscribeGlobal(stream, signal);
      done = true;
    },
  }));
  return { app, closed: (): boolean => done };
}

function listening(app: ReturnType<typeof createApp>): Promise<ServerType> {
  return new Promise<ServerType>((resolve) => {
    const server = serve({ fetch: app.fetch, port: 0, hostname: "127.0.0.1" }, () => {
      resolve(server);
    });
  });
}

function portOf(server: ServerType): number {
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("the test server is not on a port");
  }
  return address.port;
}

async function firstChunk(response: Response): Promise<string> {
  const body = response.body;
  if (body === null) {
    throw new Error("the response has no body");
  }
  const reader = body.getReader();
  const { value } = await reader.read();
  reader.releaseLock();
  return new TextDecoder().decode(value ?? new Uint8Array());
}

describe("createApp", () => {
  it("reports health with the version and the uptime", async () => {
    const { app } = built();

    const response = await app.request("/api/health");

    expect(response.status).toBe(200);
    expect(response.headers.get("x-slopify-version")).toBe("1.2.3");
    expect(await response.json()).toEqual({ status: "ok", version: "1.2.3", uptimeMs: 500 });
  });

  it("answers an unknown API route with problem+json and the version header", async () => {
    const { app } = built();

    const response = await app.request("/api/nothing/here");

    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toBe("application/problem+json");
    expect(response.headers.get("x-slopify-version")).toBe("1.2.3");
    expect(await response.json()).toEqual({
      type: "about:blank",
      title: "Not Found",
      status: 404,
      detail: "GET /api/nothing/here is not a route of this API.",
      instance: "/api/nothing/here",
    });
  });

  it("never lets an API path fall through to the SPA", async () => {
    const { app } = withSpa();

    const response = await app.request("/api/projects/p1");

    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toBe("application/problem+json");
  });

  it("serves a placeholder instead of the SPA while the UI is not built", async () => {
    const { app } = built();

    const response = await app.request("/");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/plain");
    expect(await response.text()).toContain("not built");
  });

  it("serves the built SPA and falls back to index.html for client routes", async () => {
    const { app } = withSpa();

    expect(await (await app.request("/assets/app.js")).text()).toBe("console.log('spa')");
    expect(await (await app.request("/")).text()).toContain("<title>Slopify</title>");
    expect(await (await app.request("/projects/p1")).text()).toContain("<title>Slopify</title>");
  });

  it("holds the global event stream open and opens it with running.count", async () => {
    const { app } = built();
    const aborter = new AbortController();

    const response = await app.request("/api/events/global", { signal: aborter.signal });

    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(await firstChunk(response)).toContain("event: running.count");
    aborter.abort();
  });

  // Hono's stream swallows write failures, so a subscriber whose browser went away is
  // only ever removed by the request's abort signal: this is that wiring, over a socket.
  it("drops the subscriber when the browser disconnects", async () => {
    const { app, closed } = spied();
    const server = await listening(app);
    try {
      const aborter = new AbortController();
      const url = `http://127.0.0.1:${portOf(server)}/api/events/global`;
      const response = await fetch(url, { signal: aborter.signal });
      expect(await firstChunk(response)).toContain("running.count");

      aborter.abort();

      await vi.waitFor(() => {
        expect(closed()).toBe(true);
      });
    } finally {
      server.close();
    }
  });

  it("routes a project event to the subscriber of that project", async () => {
    const { app, hub } = built();
    const aborter = new AbortController();

    const response = await app.request("/api/events/projects/p1", { signal: aborter.signal });
    const chunk = firstChunk(response);
    hub.emit("p1", { type: "stage.state", projectId: "p1", stage: "video", state: "done" });

    expect(await chunk).toContain('"stage":"video"');
    aborter.abort();
  });
});
