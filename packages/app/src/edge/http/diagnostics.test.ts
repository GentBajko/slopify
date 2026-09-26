import { Hono } from "hono";
import { expect, it } from "vitest";
import { startFixture } from "../../slices/play-drafts/draft.fake.js";
import type { AppDeps } from "./app.js";
import { diagnosticsRoutes } from "./diagnostics.js";

it("returns a downloadable diagnostics bundle without credentials", async () => {
  const h = startFixture();
  try {
    const app = new Hono().route(
      "/api/diagnostics",
      diagnosticsRoutes({
        ...h.deps,
        version: "0.8.5",
        probe: async () => ({ ran: false, stdout: "" }),
        catalogue: h.deps.catalogue,
      } as unknown as AppDeps),
    );
    const response = await app.request("/api/diagnostics");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toContain("slopify-diagnostics.json");
    const body = await response.json();
    expect(body).toMatchObject({
      appVersion: "0.8.5",
      schemaVersion: 18,
      providers: expect.arrayContaining([
        expect.objectContaining({ id: "codex", readiness: { kind: "cli", installed: false } }),
      ]),
    });
    expect(JSON.stringify(body)).not.toContain("provider_keys");
  } finally {
    h.close();
  }
});
