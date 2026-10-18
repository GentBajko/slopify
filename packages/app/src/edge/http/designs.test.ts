import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { Hono } from "hono";
import { afterEach, describe, expect, it } from "vitest";
import {
  designCatalogue,
  designHarness,
  type Harness,
  pngOf,
} from "../../slices/designs/designs.fake.js";
import { poster } from "../../slices/designs/document.fake.js";
import { createDesignRenderer } from "../../slices/designs/render.js";
import { createDesignRunner } from "../../slices/designs/runner.js";
import { resolveFont } from "../../slices/fonts/index.js";
import { designRoutes } from "./designs.js";

let h: Harness;
afterEach(() => h.cleanup());

function setup() {
  h = designHarness();
  const runner = createDesignRunner({
    ...h.deps,
    catalogue: () => designCatalogue,
    generate: async () => ({ bytes: pngOf(640, 640, 3), mime: "image/png" }),
  });
  const renderer = createDesignRenderer({
    db: h.db,
    paths: h.paths,
    log: h.deps.log,
    clock: h.deps.clock,
    ffmpeg: "ffmpeg",
    runFfmpeg: async (run) =>
      writeFileSync(join(run.cwd ?? "", String(run.args.at(-1))), pngOf(9, 9)),
    font: (id) => resolveFont(h.paths, id),
    pdf: async () => new TextEncoder().encode("%PDF-1.3"),
  });
  const app = new Hono().route("/designs", designRoutes({ service: h.deps, runner, renderer }));
  const send = (method: string, path: string, body?: unknown) =>
    app.request(path, {
      method,
      headers: { "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  return { app, runner, send };
}

const create = (extra: object = {}) => ({
  id: "d1",
  mutationId: "mutation-0001",
  kind: "edit",
  name: "Me",
  ...extra,
});

async function problemOf(response: Response) {
  expect(response.headers.get("content-type")).toBe("application/problem+json");
  return (await response.json()) as {
    status: number;
    detail: string;
    reason: string;
    quote?: { high: number };
    current?: { name: string };
  };
}

describe("design routes", () => {
  it("makes a design from an upload, lists it and serves its picture", async () => {
    const { send } = setup();
    const made = await send(
      "POST",
      "/designs",
      create({ stagedFileId: h.stage(pngOf(1080, 1920)) }),
    );
    expect(made.status).toBe(201);
    const design = (await made.json()) as { id: string; steps: { id: string }[] };
    expect((await (await send("GET", "/designs")).json()) as unknown).toMatchObject({
      designs: [{ id: "d1" }],
    });
    expect(await (await send("GET", "/designs?projectId=p9")).json()).toEqual({ designs: [] });
    const picture = await send("GET", `/designs/d1/steps/${design.steps[0]?.id ?? ""}/picture`);
    expect([picture.status, picture.headers.get("content-type")]).toEqual([200, "image/png"]);
    expect(new Uint8Array(await picture.arrayBuffer())).toEqual(pngOf(1080, 1920));
  });

  it("answers every refusal as a problem that says what to do", async () => {
    const { send } = setup();
    const missing = await problemOf(await send("GET", "/designs/nope"));
    expect([missing.status, missing.reason, missing.detail]).toEqual([
      404,
      "not-found",
      "This design no longer exists. Open Library → Designs to choose another.",
    ]);
    const blank = await problemOf(await send("POST", "/designs", create()));
    expect([blank.status, blank.reason]).toEqual([400, "invalid"]);
    expect((await send("GET", "/designs/bad%20id")).status).toBe(400);
    expect((await send("GET", "/designs/d1/files/poster.gif")).status).toBe(400);
    expect((await send("GET", "/designs/d1/steps/x/picture")).status).toBe(404);
  });

  it("starts an edit, refusing one whose price rose with the new quote", async () => {
    const { send, runner } = setup();
    const made = (await (
      await send("POST", "/designs", create({ stagedFileId: h.stage(pngOf(100, 100)) }))
    ).json()) as {
      steps: { id: string }[];
    };
    const edit = {
      mutationId: "edit-000001",
      fromStepId: made.steps[0]?.id,
      instruction: "Darker sky",
      provider: "fal",
      model: "fal-ai/flux-2",
    };
    const quote = (await (
      await send("POST", "/designs/d1/quote", { provider: "fal", model: "fal-ai/flux-2" })
    ).json()) as { high: number };
    expect(quote.high).toBe(0.06);
    const rose = await problemOf(
      await send("POST", "/designs/d1/edit", { ...edit, acknowledgedHigh: 0.01 }),
    );
    expect([rose.status, rose.reason, rose.quote?.high]).toEqual([409, "cost-changed", 0.06]);
    const started = await send("POST", "/designs/d1/edit", {
      ...edit,
      acknowledgedHigh: quote.high,
    });
    expect(started.status).toBe(202);
    await runner.idle();
    const after = (await (await send("GET", "/designs/d1")).json()) as {
      steps: { state: string; id: string }[];
    };
    expect(after.steps.map((step) => step.state)).toEqual(["ready", "ready"]);
    const retry = await problemOf(
      await send("POST", `/designs/d1/steps/${after.steps[1]?.id ?? ""}/retry`),
    );
    expect([retry.status, retry.reason]).toEqual([409, "busy"]);
    const head = await send("PUT", "/designs/d1/head", { stepId: after.steps[0]?.id });
    expect(head.status).toBe(200);
  });

  it("refuses a save made on an older copy with the current design", async () => {
    const { send } = setup();
    const made = (await (
      await send("POST", "/designs", create({ kind: "design", document: poster() }))
    ).json()) as { updatedAt: string };
    h.clock.advance(1000);
    expect(
      (await send("PUT", "/designs/d1", { baseUpdatedAt: made.updatedAt, name: "First" })).status,
    ).toBe(200);
    const stale = await problemOf(
      await send("PUT", "/designs/d1", { baseUpdatedAt: made.updatedAt, name: "Second" }),
    );
    expect([stale.status, stale.reason, stale.current?.name]).toEqual([409, "changed", "First"]);
  });

  it("makes artwork, downloads each format and moves a design to the trash", async () => {
    const { send, runner } = setup();
    const values = { Event: "Late Set", Date: "2026-11-14", Venue: "The Cellar", Price: "€12" };
    await send("POST", "/designs", create({ kind: "design", document: poster(), values }));
    const quote = (await (await send("POST", "/designs/d1/artwork/quote")).json()) as {
      high: number;
    };
    expect(
      (
        await send("POST", "/designs/d1/artwork", {
          mutationId: "art-000001",
          acknowledgedHigh: quote.high,
        })
      ).status,
    ).toBe(202);
    await runner.idle();
    const png = await send("GET", "/designs/d1/files/a4.png");
    expect([
      png.status,
      png.headers.get("content-type"),
      png.headers.get("content-disposition"),
    ]).toEqual([
      200,
      "image/png",
      `attachment; filename="Late-Set-a4.png"; filename*=UTF-8''Late-Set-a4.png`,
    ]);
    const pdf = await send("GET", "/designs/d1/files/a4.pdf");
    expect([pdf.status, await pdf.text()]).toEqual([200, "%PDF-1.3"]);
    const notTicked = await problemOf(await send("GET", "/designs/d1/files/wide.png"));
    expect([notTicked.status, notTicked.detail]).toEqual([
      400,
      "Wide 16:9 isn't ticked for this design. Tick it under Formats, then download again.",
    ]);
    expect((await send("DELETE", "/designs/d1")).status).toBe(204);
    expect((await send("GET", "/designs/d1")).status).toBe(404);
    expect((await send("DELETE", "/designs/d1")).status).toBe(404);
    expect(h.events.at(-1)).toEqual({ type: "design.changed", designId: "d1" });
  });

  it("says designs are unavailable when this copy has none", async () => {
    const app = new Hono().route("/designs", designRoutes(undefined));
    const response = await app.request("/designs");
    expect(response.status).toBe(503);
    h = designHarness();
  });
});
