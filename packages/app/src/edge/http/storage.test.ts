import { Hono } from "hono";
import { expect, it } from "vitest";
import { startFixture } from "../../slices/play-drafts/draft.fake.js";
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
