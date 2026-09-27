import { Hono } from "hono";
import { expect, it } from "vitest";
import { draftFixture } from "../../slices/play-drafts/draft.fake.js";
import { insertMachine } from "../../slices/telemetry/repo.js";
import { whatsNewRoutes } from "./whats-new.js";

it("tells the web app to show the tour once after an update, and records closing it", async () => {
  const h = draftFixture();
  try {
    insertMachine(h.deps.db, {
      machineId: "11111111-1111-4111-8111-111111111111",
      noticeSeenAt: "2026-01-01T00:00:00.000Z",
      appVersion: "2.4.0",
    });
    const app = new Hono().route(
      "/api/whats-new",
      whatsNewRoutes({ db: h.deps.db, version: "3.0.0" }),
    );
    expect(await (await app.request("/api/whats-new")).json()).toEqual({ show: true, major: 3 });
    const seen = await app.request("/api/whats-new/seen", { method: "POST" });
    expect(seen.status).toBe(200);
    expect(await seen.json()).toEqual({ show: false, major: 3 });
    expect(await (await app.request("/api/whats-new")).json()).toEqual({ show: false, major: 3 });
  } finally {
    h.close();
  }
});
