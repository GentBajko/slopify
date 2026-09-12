import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { Hono } from "hono";
import { expect, it } from "vitest";
import { startFixture } from "../../slices/play-drafts/draft.fake.js";
import { readSetting, writeSetting } from "../../slices/settings/repo.js";
import { createUpdater } from "../../updater/service.js";
import { createHub } from "../events/hub.js";
import { createApp } from "./app.js";
import { problemFromError } from "./problem.js";
import { tutorialRoutes } from "./tutorial.js";

function put(value: unknown): RequestInit {
  return {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(value),
  };
}
const session = { schemaVersion: 1, active: true, stepId: "play-subtitles" };

it("validates tutorial writes, replays once and reports stale writes as problems", async () => {
  const h = startFixture();
  const app = new Hono()
    .onError((e, c) => problemFromError(c, e, h.deps))
    .route("/api/tutorial", tutorialRoutes(h.deps));
  try {
    const input = { baseVersion: 0, mutationId: randomUUID(), session };
    expect(
      (await app.request("/api/tutorial", put({ ...input, session: { ...session, form: {} } })))
        .status,
    ).toBe(400);
    expect((await app.request("/api/tutorial", put({ ...input, baseVersion: -1 }))).status).toBe(
      400,
    );
    expect(
      (await app.request("/api/tutorial", put({ ...input, mutationId: "invalid" }))).status,
    ).toBe(400);
    expect((await app.request("/api/tutorial", { ...put(input), body: "{" })).status).toBe(400);
    for (let i = 0; i < 2; i++) {
      const response = await app.request("/api/tutorial", put(input));
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ version: 1, session, readable: true });
    }
    const stale = await app.request("/api/tutorial", put({ ...input, mutationId: randomUUID() }));
    expect(stale.status).toBe(409);
    expect(stale.headers.get("content-type")).toContain("application/problem+json");
    expect(await stale.json()).toMatchObject({ reason: "conflict" });
    expect(await (await app.request("/api/tutorial")).json()).toEqual({
      version: 1,
      session,
      readable: true,
    });
  } finally {
    h.close();
  }
});

it("leaves corrupt GET data intact until explicit restart DELETE followed by PUT", async () => {
  const h = startFixture();
  const app = new Hono().route("/api/tutorial", tutorialRoutes(h.deps));
  try {
    writeSetting(h.deps.db, "tutorial.session", "broken JSON");
    expect(await (await app.request("/api/tutorial")).json()).toMatchObject({
      readable: false,
      session: { active: false },
    });
    expect(readSetting(h.deps.db, "tutorial.session")).toBe("broken JSON");
    const input = { baseVersion: 0, mutationId: randomUUID(), session };
    const refused = await app.request("/api/tutorial", put(input));
    expect(refused.status).toBe(409);
    expect(await refused.json()).toMatchObject({
      reason: "unreadable",
      detail: expect.stringContaining("Restart tutorial"),
    });
    expect((await app.request("/api/tutorial", { method: "DELETE" })).status).toBe(204);
    expect(readSetting(h.deps.db, "tutorial.session")).toBeUndefined();
    expect((await app.request("/api/tutorial", put(input))).status).toBe(200);
    expect(h.ticks).toEqual([]);
  } finally {
    h.close();
  }
});

it("registers the tutorial and gates PUT and DELETE during updates while GET stays readable", async () => {
  const h = startFixture();
  const updater = createUpdater({
    currentVersion: "0.8.5",
    latest: async () => "0.8.6",
    now: () => 0,
    busy: () => false,
    unsupported: () => undefined,
    report: () => undefined,
    install: async () => undefined,
  });
  const app = createApp({
    ...h.deps,
    updater,
    hub: createHub(h.deps),
    version: "0.8.5",
    webDist: join(h.deps.paths.dataDir, "missing"),
    flushSoon: () => undefined,
    probe: async () => ({ ran: false, stdout: "" }),
  });
  try {
    const input = { baseVersion: 0, mutationId: randomUUID(), session };
    expect((await app.request("/api/tutorial", put(input))).status).toBe(200);
    await updater.start();
    for (const method of ["PUT", "DELETE"]) {
      const response = await app.request("/api/tutorial", { ...put(input), method });
      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({ detail: expect.stringContaining("updating") });
    }
    expect(await (await app.request("/api/tutorial")).json()).toEqual({
      version: 1,
      session,
      readable: true,
    });
  } finally {
    h.close();
  }
});
