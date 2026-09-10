import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Hono } from "hono";
import { afterEach, describe, expect, it } from "vitest";
import { fixedClock } from "../../kernel/clock.fake.js";
import { openDb } from "../../kernel/db/index.js";
import { layout } from "../../kernel/paths.js";
import { fontMaxBytes } from "../../slices/fonts/index.js";
import { createHub } from "../events/hub.js";
import { fontsRoutes } from "./fonts.js";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const clean of cleanups.splice(0)) await clean();
});
async function harness() {
  const paths = layout(await mkdtemp(join(tmpdir(), "slopify-font-http-")));
  const db = openDb(paths.db);
  const ids = { next: (): string => "id1" };
  const log = { write: (): void => {} };
  const router = fontsRoutes({
    paths,
    db,
    ids,
    log,
    hub: createHub({ ids, log }),
    runner: {
      tick: (): void => {},
      settled: async (): Promise<void> => {},
      abortProject: async (): Promise<void> => {},
      abortAll: async (): Promise<void> => {},
    },
    clock: fixedClock("2026-09-10T10:00:00.000Z"),
    version: "test",
    webDist: "missing",
    flushSoon: (): void => {},
    probe: async () => ({ ran: false, stdout: "" }),
  });
  cleanups.push(async () => {
    db.close();
    await rm(paths.dataDir, { recursive: true, force: true });
  });
  return { app: new Hono().route("/api/fonts", router), paths };
}
async function fontBytes(): Promise<Buffer> {
  return readFile(new URL("../../assets/fonts/Barlow-Regular.ttf", import.meta.url));
}
async function body(filename = "font.ttf"): Promise<FormData> {
  const form = new FormData();
  form.append("file", new Blob([Uint8Array.from(await fontBytes())]), filename);
  return form;
}

describe("font HTTP routes", () => {
  // This route enumerates real system fonts; a cold Windows scan can exceed five seconds.
  it("lists public summaries without server file paths", async () => {
    const { app } = await harness();
    const response = await app.request("/api/fonts");
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toContain('"id":"default"');
    expect(text).not.toContain('"path"');
    expect(text).not.toContain('"assName"');
  }, 30_000);

  it("uploads a font and previews exactly the stored bytes", async () => {
    const { app } = await harness();
    const upload = await app.request("/api/fonts", { method: "POST", body: await body() });
    expect(upload.status).toBe(201);
    const result = (await upload.json()) as { font: { id: string } };
    const response = await app.request(`/api/fonts/${result.font.id}/file`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("font/ttf");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(Buffer.from(await response.arrayBuffer())).toEqual(await fontBytes());
  });

  it("answers 404 for malformed, path-like and missing font IDs", async () => {
    const { app } = await harness();
    for (const id of ["unknown", "..%2Fslopify.db", `uploaded-${"f".repeat(64)}`]) {
      expect((await app.request(`/api/fonts/${id}/file`)).status).toBe(404);
    }
  });

  it("rejects unsupported names, incomplete multipart and duplicate parts without persisting", async () => {
    const { app, paths } = await harness();
    expect(
      (await app.request("/api/fonts", { method: "POST", body: await body("../font.ttf") })).status,
    ).toBe(400);
    expect(
      (await app.request("/api/fonts", { method: "POST", body: await body("font.woff2") })).status,
    ).toBe(415);
    const doubled = await body();
    doubled.append("file", new Blob([Uint8Array.from(await fontBytes())]), "another.ttf");
    expect((await app.request("/api/fonts", { method: "POST", body: doubled })).status).toBe(400);
    expect(
      (
        await app.request("/api/fonts", {
          method: "POST",
          headers: { "content-type": "multipart/form-data; boundary=missing" },
          body: "broken",
        })
      ).status,
    ).toBe(400);
    await expect(readdir(join(paths.dataDir, "fonts"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects a truncated envelope even after a valid font was received", async () => {
    const { app, paths } = await harness();
    const content = Buffer.concat([
      Buffer.from(
        '--boundary\r\nContent-Disposition: form-data; name="file"; filename="font.ttf"\r\nContent-Type: font/ttf\r\n\r\n',
      ),
      await fontBytes(),
    ]);
    const response = await app.request("/api/fonts", {
      method: "POST",
      headers: { "content-type": "multipart/form-data; boundary=boundary" },
      body: content,
    });
    expect(response.status).toBe(400);
    await expect(readdir(join(paths.dataDir, "fonts"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects oversized uploads before writing a font", async () => {
    const { app, paths } = await harness();
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(fontMaxBytes + 1)]), "large.ttf");
    const response = await app.request("/api/fonts", { method: "POST", body: form });
    expect(response.status).toBe(413);
    await expect(readdir(join(paths.dataDir, "fonts"))).rejects.toMatchObject({ code: "ENOENT" });
  });
});
