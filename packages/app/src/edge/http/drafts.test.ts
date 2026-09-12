import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { Hono } from "hono";
import { expect, it } from "vitest";
import { startFixture } from "../../slices/play-drafts/draft.fake.js";
import {
  draftViewSchema,
  playReviewSchema,
  playStartResultSchema,
} from "../../slices/play-drafts/schema.js";
import { createUpdater } from "../../updater/service.js";
import { createHub } from "../events/hub.js";
import { createApp } from "./app.js";
import { draftRoutes } from "./drafts.js";
import { problemFromError } from "./problem.js";

function json(method: string, value: unknown): RequestInit {
  return { method, headers: { "content-type": "application/json" }, body: JSON.stringify(value) };
}

it("returns consumed draft receipts, replays starts after discard, and rejects unknown properties", async () => {
  const h = startFixture();
  const app = new Hono()
    .onError((e, c) => problemFromError(c, e, h.deps))
    .route("/api/drafts", draftRoutes(h.deps));
  const id = randomUUID();
  try {
    expect(
      (
        await app.request(
          "/api/drafts",
          json("POST", { id, document: { ...h.document, unexpected: true } }),
        )
      ).status,
    ).toBe(400);
    const made = await app.request("/api/drafts", json("POST", { id, document: h.document }));
    expect(made.status).toBe(201);
    const view = draftViewSchema.parse(await made.json());
    expect(
      (await app.request("/api/drafts", json("POST", { id, document: h.document }))).status,
    ).toBe(200);
    const reviewed = await app.request(
      `/api/drafts/${id}/review`,
      json("POST", { baseVersion: view.draft.version }),
    );
    expect(reviewed.status).toBe(200);
    const review = playReviewSchema.parse(await reviewed.json());
    const input = { baseVersion: view.draft.version, reviewId: review.id };
    const started = await app.request(`/api/drafts/${id}/start`, json("POST", input));
    expect(started.status).toBe(201);
    const result = playStartResultSchema.parse(await started.json());
    const consumedEdit = await app.request(
      `/api/drafts/${id}`,
      json("PUT", { baseVersion: 1, mutationId: randomUUID(), document: h.document }),
    );
    expect(consumedEdit.status).toBe(409);
    expect(await consumedEdit.json()).toMatchObject({
      reason: "already-started",
      currentVersion: 1,
      fields: [],
    });
    expect(
      draftViewSchema.parse(await (await app.request(`/api/drafts/${id}`)).json()).start
        ?.projectIds,
    ).toEqual(result.projectIds);
    expect(
      (await app.request(`/api/drafts/${id}`, json("DELETE", { baseVersion: view.draft.version })))
        .status,
    ).toBe(200);
    expect((await app.request(`/api/drafts/${id}`)).status).toBe(404);
    const replay = await app.request(`/api/drafts/${id}/start`, json("POST", input));
    expect(replay.status).toBe(200);
    expect(playStartResultSchema.parse(await replay.json())).toEqual({ ...result, replayed: true });
    expect(h.ticks).toHaveLength(1);
  } finally {
    h.close();
  }
});

it("saves, forks, lists unreadable drafts, and leaves documents unchanged on typed refusals", async () => {
  const h = startFixture();
  const app = new Hono().route("/api/drafts", draftRoutes(h.deps));
  const id = randomUUID();
  try {
    await app.request("/api/drafts", json("POST", { id, document: h.document }));
    const conflict = await app.request(
      `/api/drafts/${id}`,
      json("PUT", { baseVersion: 2, mutationId: randomUUID(), document: h.document }),
    );
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toMatchObject({
      reason: "conflict",
      currentVersion: 1,
      fields: [],
    });
    const saved = await app.request(
      `/api/drafts/${id}`,
      json("PUT", {
        baseVersion: 1,
        mutationId: randomUUID(),
        document: { ...h.document, expectedWords: " " },
      }),
    );
    expect(draftViewSchema.parse(await saved.json()).draft.version).toBe(2);
    const forkId = randomUUID();
    for (const status of [201, 200]) {
      expect(
        (
          await app.request(
            `/api/drafts/${id}/fork`,
            json("POST", { id: forkId, document: h.document }),
          )
        ).status,
      ).toBe(status);
    }
    expect((await app.request("/api/drafts/unsafe")).status).toBe(400);
    expect((await app.request(`/api/drafts/${randomUUID()}`)).status).toBe(404);
    h.deps.db.prepare("UPDATE play_drafts SET document_json='{}' WHERE id=?").run(id);
    expect((await app.request(`/api/drafts/${id}`)).status).toBe(409);
    expect(await (await app.request("/api/drafts")).json()).toMatchObject({
      drafts: expect.arrayContaining([expect.objectContaining({ id, readable: false })]),
    });
  } finally {
    h.close();
  }
});

it("registers drafts in the real app and gates every mutation during updates", async () => {
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
    drafts: h.deps,
    updater,
    hub: createHub(h.deps),
    version: "0.8.5",
    webDist: join(h.deps.paths.dataDir, "missing"),
    flushSoon: () => undefined,
    probe: async () => ({ ran: false, stdout: "" }),
  });
  const id = randomUUID();
  try {
    expect(
      (await app.request("/api/drafts", json("POST", { id, document: h.document }))).status,
    ).toBe(201);
    await updater.start();
    const paths = [
      ["POST", "/api/drafts"],
      ["PUT", `/api/drafts/${id}`],
      ["DELETE", `/api/drafts/${id}`],
      ["POST", `/api/drafts/${id}/fork`],
      ["POST", `/api/drafts/${id}/review`],
      ["POST", `/api/drafts/${id}/start`],
      ["PUT", `/api/drafts/${id}/attachments/${randomUUID()}/file`],
    ] as const;
    for (const [method, path] of paths) {
      const response = await app.request(path, { method });
      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({ detail: expect.stringContaining("updating") });
    }
    expect((await app.request(`/api/drafts/${id}`)).status).toBe(200);
    expect(h.deps.db.prepare("SELECT version FROM play_drafts WHERE id=?").get(id)).toEqual({
      version: 1,
    });
  } finally {
    h.close();
  }
});

it("returns linked readiness and pending-start refusals without changing saved documents", async () => {
  const h = startFixture();
  const app = new Hono().route("/api/drafts", draftRoutes(h.deps));
  const id = randomUUID();
  const reviewId = randomUUID();
  const document = { ...h.document, expectedWords: "invalid" };
  try {
    await app.request("/api/drafts", json("POST", { id, document }));
    const readiness = await app.request(
      `/api/drafts/${id}/review`,
      json("POST", { baseVersion: 1 }),
    );
    expect(readiness.status).toBe(400);
    expect(await readiness.json()).toMatchObject({
      reason: "readiness",
      currentVersion: 1,
      fields: expect.arrayContaining([expect.objectContaining({ field: "expectedWords" })]),
    });
    const stale = await app.request(
      `/api/drafts/${id}/start`,
      json("POST", { baseVersion: 1, reviewId }),
    );
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({ reason: "stale-review", currentVersion: 1 });
    h.deps.db
      .prepare("UPDATE play_drafts SET state='starting',review_id=?,start_id=? WHERE id=?")
      .run(reviewId, reviewId, id);
    const pending = await app.request(
      `/api/drafts/${id}`,
      json("PUT", { baseVersion: 1, mutationId: randomUUID(), document: h.document }),
    );
    expect(pending.status).toBe(409);
    expect(await pending.json()).toMatchObject({
      reason: "pending-start",
      currentVersion: 1,
      reviewId,
      fields: [],
    });
    const view = draftViewSchema.parse(await (await app.request(`/api/drafts/${id}`)).json());
    expect(view.pendingStart).toEqual({ reviewId, draftVersion: 1 });
    expect(view.draft.document).toEqual(document);
  } finally {
    h.close();
  }
});
