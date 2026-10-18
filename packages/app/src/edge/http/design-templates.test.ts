import { Hono } from "hono";
import { afterEach, expect, it } from "vitest";
import {
  designCatalogue,
  designHarness,
  type Harness,
  pngOf,
} from "../../slices/designs/designs.fake.js";
import { poster } from "../../slices/designs/document.fake.js";
import { createDesignRunner } from "../../slices/designs/runner.js";
import { type DesignTemplateRoutesDeps, designTemplateRoutes } from "./design-templates.js";

let h: Harness;
afterEach(() => h.cleanup());

function setup(extra: Partial<DesignTemplateRoutesDeps> = {}) {
  h = designHarness();
  const runner = createDesignRunner({
    ...h.deps,
    catalogue: () => designCatalogue,
    generate: async () => ({ bytes: pngOf(1080, 1920), mime: "image/png" }),
  });
  const app = new Hono().route(
    "/design-templates",
    designTemplateRoutes({ service: h.deps, runner, catalogue: () => designCatalogue, ...extra }),
  );
  const send = (method: string, path: string, body?: unknown) =>
    app.request(path, {
      method,
      headers: { "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  return { send, runner };
}

const values = { Event: "Late Set", Date: "2026-11-14", Venue: "The Cellar", Price: "€12" };

it("creates a template, saves versions and refuses a stale Save with the current one", async () => {
  const { send } = setup();
  const made = await send("POST", "/design-templates", {
    id: "t1",
    mutationId: "mutation-0001",
    name: "Gig poster",
    document: poster(),
  });
  expect(made.status).toBe(201);
  const saved = await send("PUT", "/design-templates/t1", {
    baseVersion: 1,
    name: "Gig poster v2",
    document: poster(),
  });
  expect(await saved.json()).toMatchObject({
    saved: true,
    sample: null,
    template: { headVersion: 2, name: "Gig poster v2" },
  });
  const stale = await send("PUT", "/design-templates/t1", {
    baseVersion: 1,
    name: "Other",
    document: poster(),
  });
  expect([
    stale.status,
    ((await stale.json()) as { current: { headVersion: number } }).current.headVersion,
  ]).toEqual([409, 2]);
  expect(await (await send("GET", "/design-templates")).json()).toMatchObject({
    templates: [{ id: "t1" }],
  });
  expect((await send("GET", "/design-templates/gone")).status).toBe(404);
});

it("hands a Save to the sample when the editor has one", async () => {
  const seen: unknown[] = [];
  const { send } = setup({
    samples: {
      afterSave: (input) => {
        seen.push([input.version, input.sample, input.acknowledgedHigh]);
        return { ok: true, value: { state: "queued" } };
      },
    },
  });
  await send("POST", "/design-templates", {
    id: "t1",
    mutationId: "mutation-0001",
    name: "Gig poster",
    document: poster(),
  });
  const saved = await send("PUT", "/design-templates/t1", {
    baseVersion: 1,
    name: "v2",
    document: poster(),
    sample: "make",
    acknowledgedHigh: 0.04,
  });
  expect(await saved.json()).toMatchObject({ sample: { state: "queued" } });
  expect(seen).toEqual([[2, "make", 0.04]]);
});

it("refuses Mark ready with the checks that failed, then marks it once they pass", async () => {
  const { send } = setup({
    checks: async () => [
      { id: "fonts", ok: true, sentence: "Every letter is in its font.", fix: null },
    ],
  });
  await send("POST", "/design-templates", {
    id: "t1",
    mutationId: "mutation-0001",
    name: "Gig",
    document: poster({ samples: {} }),
  });
  const refused = await send("POST", "/design-templates/t1/ready", { version: 1 });
  const body = (await refused.json()) as {
    reason: string;
    checks: { id: string }[];
    detail: string;
  };
  expect([refused.status, body.reason, body.checks.map((check) => check.id)]).toEqual([
    409,
    "not-ready",
    ["samples"],
  ]);
  await send("PUT", "/design-templates/t1", { baseVersion: 1, name: "Gig", document: poster() });
  const ready = await send("POST", "/design-templates/t1/ready", { version: 2 });
  expect(await ready.json()).toMatchObject({ gate: "ready", readyVersion: 2 });
});

it("quotes and makes one piece, refusing a missing value", async () => {
  const { send, runner } = setup();
  await send("POST", "/design-templates", {
    id: "t1",
    mutationId: "mutation-0001",
    name: "Gig",
    document: poster(),
  });
  const quote = (await (await send("POST", "/design-templates/t1/quote")).json()) as {
    high: number;
  };
  const missing = await send("POST", "/design-templates/t1/make", {
    mutationId: "make-000001",
    values: {},
    acknowledgedHigh: quote.high,
  });
  expect([missing.status, ((await missing.json()) as { reason: string }).reason]).toEqual([
    400,
    "missing-values",
  ]);
  const made = await send("POST", "/design-templates/t1/make", {
    mutationId: "make-000002",
    values,
    acknowledgedHigh: quote.high,
  });
  expect(made.status).toBe(202);
  await runner.idle();
  expect((await send("DELETE", "/design-templates/t1")).status).toBe(204);
  expect((await send("DELETE", "/design-templates/t1")).status).toBe(404);
});

it("says design templates are unavailable when this copy has none", async () => {
  h = designHarness();
  const app = new Hono().route("/design-templates", designTemplateRoutes(undefined));
  expect((await app.request("/design-templates")).status).toBe(503);
});
