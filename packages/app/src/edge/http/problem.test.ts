import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { describe, expect, it } from "vitest";
import type { Ids } from "../../kernel/ids.js";
import type { Log, LogFields, LogLevel } from "../../kernel/log.js";
import { problem, problemFromError } from "./problem.js";

interface Recorded {
  readonly level: LogLevel;
  readonly event: string;
  readonly detail: string | undefined;
}

const ids: Ids = { next: (): string => "cid-1" };

function recorder(): { log: Log; lines: Recorded[] } {
  const lines: Recorded[] = [];
  return {
    log: {
      write: (level: LogLevel, event: string, fields?: LogFields): void => {
        lines.push({ level, event, detail: fields?.detail });
      },
    },
    lines,
  };
}

function appWith(thrown: Error): { app: Hono; lines: Recorded[] } {
  const { log, lines } = recorder();
  const app = new Hono()
    .onError((error, c) => problemFromError(c, error, { ids, log }))
    .get("/api/boom", () => {
      throw thrown;
    });
  return { app, lines };
}

describe("problem", () => {
  it("answers with the RFC 9457 members and media type", async () => {
    const app = new Hono().get("/api/projects/p1", (c) =>
      problem(c, { status: 404, title: "Not Found", detail: "no project p1" }),
    );

    const response = await app.request("/api/projects/p1");

    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toBe("application/problem+json");
    expect(await response.json()).toEqual({
      type: "about:blank",
      title: "Not Found",
      status: 404,
      detail: "no project p1",
      instance: "/api/projects/p1",
    });
  });

  it("carries extension members beside the standard ones without shadowing them", async () => {
    const app = new Hono().post("/api/projects", (c) =>
      problem(c, {
        status: 400,
        title: "Bad Request",
        type: "https://slopify.local/problems/validation",
        extensions: { fields: [{ path: "title", message: "required" }], title: "hijacked" },
      }),
    );

    const response = await app.request("/api/projects", { method: "POST" });

    expect(await response.json()).toEqual({
      type: "https://slopify.local/problems/validation",
      title: "Bad Request",
      status: 400,
      instance: "/api/projects",
      fields: [{ path: "title", message: "required" }],
    });
  });
});

describe("problemFromError", () => {
  it("turns an unexpected error into a generic 500 with a correlation id", async () => {
    const { app, lines } = appWith(new Error("connect ECONNREFUSED 127.0.0.1:11434"));

    const response = await app.request("/api/boom");
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(response.headers.get("content-type")).toBe("application/problem+json");
    expect(body).toEqual({
      type: "about:blank",
      title: "Internal Server Error",
      status: 500,
      detail: "The server failed to handle this request. Correlation id cid-1 is in the log.",
      instance: "/api/boom",
      correlationId: "cid-1",
    });
    expect(lines).toEqual([
      {
        level: "error",
        event: "http.error",
        detail: "cid-1 GET /api/boom: connect ECONNREFUSED 127.0.0.1:11434",
      },
    ]);
  });

  it("never puts a provider key on the wire", async () => {
    const { app, lines } = appWith(
      new Error("401 from provider using key sk-or-v1-9f8e7d6c5b4a3210"),
    );

    const text = await (await app.request("/api/boom")).text();

    expect(text).not.toContain("sk-or-v1");
    expect(lines[0]?.detail).toContain("cid-1");
  });

  it("keeps the status of an HTTPException", async () => {
    const { app } = appWith(new HTTPException(409, { message: "a run is already in flight" }));

    const response = await app.request("/api/boom");

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      type: "about:blank",
      title: "Conflict",
      status: 409,
      detail: "a run is already in flight",
      instance: "/api/boom",
    });
  });
});
