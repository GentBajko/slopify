import { zipSync } from "fflate";
import { Hono } from "hono";
import { expect, it } from "vitest";
import { startFixture } from "../../slices/play-drafts/draft.fake.js";
import { portableMaxArchiveBytes } from "../../slices/storage/portable.js";
import type { AppDeps } from "./app.js";
import { storageRoutes } from "./storage.js";

it("reports aggregate and per-project storage without exposing backup contents", async () => {
  const h = startFixture();
  try {
    const app = new Hono().route("/api/storage", storageRoutes(h.deps as unknown as AppDeps));
    const response = await app.request("/api/storage");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: expect.any(Number),
      projects: 0,
      staging: 0,
      byProject: [],
    });
  } finally {
    h.close();
  }
});

it("refuses non-ZIP imports before reading the request body", async () => {
  const h = startFixture();
  try {
    const app = new Hono().route("/api/storage", storageRoutes(h.deps as unknown as AppDeps));
    const response = await app.request("/api/storage/import", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ settings: {} }),
    });
    expect(response.status).toBe(415);
  } finally {
    h.close();
  }
});

it("stops reading an upload as soon as its streamed bytes exceed the limit", async () => {
  const h = startFixture();
  try {
    const app = new Hono().route("/api/storage", storageRoutes(h.deps as unknown as AppDeps));
    const block = new Uint8Array(2 * 1024 * 1024);
    let pulls = 0;
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        controller.enqueue(block);
        if (pulls >= 60) controller.close();
      },
      cancel() {
        cancelled = true;
      },
    });
    const request = new Request("http://localhost/api/storage/import", {
      method: "PUT",
      headers: { "content-type": "application/zip" },
      body,
      duplex: "half",
    } as RequestInit & { duplex: "half" });

    const response = await app.request(request);

    expect(response.status).toBe(413);
    expect(cancelled).toBe(true);
    expect(pulls * block.byteLength).toBeGreaterThan(portableMaxArchiveBytes);
    expect(pulls).toBeLessThan(60);
  } finally {
    h.close();
  }
});

it("streams a bounded portable backup through to the importer", async () => {
  const h = startFixture();
  try {
    const app = new Hono().route("/api/storage", storageRoutes(h.deps as unknown as AppDeps));
    const archive = zipSync({
      "manifest.json": Buffer.from(
        JSON.stringify({
          version: 1,
          createdAt: "2026-09-13T12:00:00.000Z",
          settings: {},
          prompts: [],
          entries: [],
          voices: [],
          templates: [],
          fonts: [],
          staged: [],
        }),
      ),
    });

    const response = await app.request("/api/storage/import", {
      method: "PUT",
      headers: { "content-type": "application/zip" },
      body: archive,
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      settings: 0,
      prompts: 0,
      entries: 0,
      voices: 0,
      templates: 0,
      fonts: 0,
      fontFallbacks: 0,
      stagedFiles: 0,
    });
  } finally {
    h.close();
  }
});

it("refuses to export while a project is being made, before any download starts", async () => {
  const h = startFixture();
  try {
    h.deps.db
      .prepare(
        "INSERT INTO projects(id,title,format,config,created_at,updated_at) VALUES ('p1','Rope knots','16:9','{}','t','t')",
      )
      .run();
    h.deps.db
      .prepare(
        "INSERT INTO stages(id,project_id,kind,source,state) VALUES ('s1','p1','audio','generate','running')",
      )
      .run();
    const app = new Hono().route(
      "/api/storage",
      storageRoutes({
        ...h.deps,
        version: "test",
        runner: {},
        log: { write: () => undefined },
      } as unknown as AppDeps),
    );

    const summary = await app.request("/api/storage/export/summary");
    expect(await summary.json()).toEqual({
      ready: false,
      detail: expect.stringContaining('"Rope knots"'),
      busy: [{ id: "p1", title: "Rope knots" }],
    });
    const download = await app.request("/api/storage/export");
    expect(download.status).toBe(409);
    expect(((await download.json()) as { detail: string }).detail).toContain(
      "Wait for them to finish, or pause them on their project page",
    );
  } finally {
    h.close();
  }
});

it("answers a refused full backup with the reason and how to fix it", async () => {
  const h = startFixture();
  try {
    const app = new Hono().route(
      "/api/storage",
      storageRoutes({ ...h.deps, version: "test", runner: {} } as unknown as AppDeps),
    );
    const response = await app.request("/api/storage/import", {
      method: "PUT",
      headers: { "content-type": "application/x-tar" },
      body: new Uint8Array(1024),
    });
    expect(response.status).toBe(400);
    expect(((await response.json()) as { detail: string }).detail).toBe(
      "This backup can't be imported: the file ends before the backup does; it was probably cut short while downloading. Choose a .tar file made with Export everything in Settings → Backup & storage, or export it again.",
    );
  } finally {
    h.close();
  }
});
