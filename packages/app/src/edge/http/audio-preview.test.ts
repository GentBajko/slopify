import { Hono } from "hono";
import { afterEach, describe, expect, it } from "vitest";
import { createAudioPreviewStore } from "../../kernel/audio-preview.js";
import { fixedClock } from "../../kernel/clock.fake.js";
import { openDb } from "../../kernel/db/index.js";
import { migrate } from "../../kernel/db/migrate.js";
import { audioPreviewRoutes } from "./audio-preview.js";

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});
function harness() {
  const db = openDb(":memory:");
  migrate(db, fixedClock("2026-09-10T00:00:00.000Z"));
  db.exec("INSERT INTO projects VALUES ('p1','Preview','16:9','{}','2026-09-10','2026-09-10')");
  db.exec("INSERT INTO projects VALUES ('p2','Other','16:9','{}','2026-09-10','2026-09-10')");
  const audioPreviews = createAudioPreviewStore();
  const app = new Hono().route("/api/projects", audioPreviewRoutes({ db, audioPreviews }));
  cleanups.push(() => {
    audioPreviews.close();
    db.close();
  });
  return { app, store: audioPreviews, db };
}
const bytes = (text: string) => new TextEncoder().encode(text);
describe("audio preview HTTP", () => {
  it("returns a manifest and delivers bytes while the original attempt is still generating", async () => {
    const { app, store, db } = harness();
    const sink = store.begin("p1", "part1", "Body part 1 of 2");
    sink.append(bytes("first"));
    const manifest = await app.request("/api/projects/p1/audio-preview");
    expect(manifest.headers.get("cache-control")).toBe("no-store");
    expect(await manifest.json()).toMatchObject({
      previews: [{ label: "Body part 1 of 2", state: "streaming", bytes: 5 }],
    });
    const id = store.list("p1")[0]?.id;
    const response = await app.request(`/api/projects/p1/audio-preview/${id}`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("audio/mpeg");
    expect(response.headers.get("content-length")).toBeNull();
    expect(response.headers.get("content-disposition")).toBeNull();
    expect(response.headers.get("accept-ranges")).toBe("none");
    const reader = response.body?.getReader();
    expect(new TextDecoder().decode((await reader?.read())?.value)).toBe("first");
    const next = reader?.read();
    sink.append(bytes("second"));
    expect(new TextDecoder().decode((await next)?.value)).toBe("second");
    sink.complete();
    expect((await reader?.read())?.done).toBe(true);
    expect(db.prepare("SELECT count(*) AS n FROM outputs").get()?.n).toBe(0);
    expect(db.prepare("SELECT count(*) AS n FROM attempts").get()?.n).toBe(0);
  });
  it("rejects wrong projects, unknown or invalid IDs, and cleared previews", async () => {
    const { app, store } = harness();
    store.begin("p1", "part", "Body").append(bytes("audio"));
    const id = store.list("p1")[0]?.id;
    expect((await app.request("/api/projects/absent/audio-preview")).status).toBe(404);
    expect((await app.request(`/api/projects/p2/audio-preview/${id}`)).status).toBe(404);
    expect((await app.request("/api/projects/p1/audio-preview/not-an-id")).status).toBe(400);
    store.clear("p1");
    expect((await app.request(`/api/projects/p1/audio-preview/${id}`)).status).toBe(404);
    expect(await (await app.request("/api/projects/p1/audio-preview")).json()).toEqual({
      previews: [],
    });
  });
  it("allows a route without a preview service and never starts generation", async () => {
    const { db } = harness();
    const app = new Hono().route("/api/projects", audioPreviewRoutes({ db }));
    expect(await (await app.request("/api/projects/p1/audio-preview")).json()).toEqual({
      previews: [],
    });
  });
});
