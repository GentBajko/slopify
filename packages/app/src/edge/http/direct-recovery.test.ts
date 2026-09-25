import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { recoveryResultSchema } from "../../slices/rebuild/recovery-model.js";
import { paidServiceFixture } from "../../slices/rebuild/service.fake.js";
import { createHub } from "../events/hub.js";
import { createApp } from "./app.js";

it("validates routes, owns one action UUID, and returns exact receipts", async () => {
  const h = await paidServiceFixture();
  try {
    const app = createApp({
      ...h.deps,
      rebuild: h.deps,
      hub: createHub(h.deps),
      version: "test",
      webDist: "/unused",
      flushSoon: () => undefined,
      probe: async () => ({ ran: false, stdout: "" }),
    });
    const post = (path: string, body: unknown) =>
      app.request(`/api/projects/${h.projectId}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    const input = { baseRevisionId: h.base.revision.id, idempotencyKey: randomUUID() };
    for (const path of ["/resume", "/stages/images/retry", "/stages/images/rerun"]) {
      expect((await post(path, { ...input, idempotencyKey: "invalid" })).status).toBe(400);
      expect((await post(path, { ...input, baseRevisionId: "stale" })).status).toBe(409);
    }
    expect((await post("/stages/unknown/rerun", input)).status).toBe(400);
    expect(
      (
        await app.request("/api/projects/missing/resume", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(input),
        })
      ).status,
    ).toBe(404);
    expect(h.ticks).toEqual([]);
    h.setCatalogue({
      ...h.catalogue,
      image: h.catalogue.image.map((model) => ({ ...model, pricing: {} })),
    });
    const resumable = async () =>
      ((await (await app.request(`/api/projects/${h.projectId}`)).json()) as { resumable: unknown })
        .resumable;
    expect(await resumable()).toBe(true);
    const accepted = await post("/resume", input);
    expect(accepted.status).toBe(202);
    expect(await resumable()).toBe(false);
    const receipt = recoveryResultSchema.parse(await accepted.json());
    expect(receipt.ok).toBe(true);
    if (receipt.ok) expect(receipt.value.warnings.join(" ")).toMatch(/prices are unknown/);
    expect(await (await post("/resume", input)).json()).toEqual(receipt);
    for (const path of ["/pause", "/cancel", "/stages/images/retry", "/stages/images/rerun"])
      expect((await post(path, input)).status).toBe(409);
    expect(
      (
        await post("/stages/article/rerun", {
          ...input,
          idempotencyKey: randomUUID(),
        })
      ).status,
    ).toBe(400);
    const running = await post("/stages/images/rerun", {
      ...input,
      idempotencyKey: randomUUID(),
    });
    expect(running.status).toBe(409);
    expect(await running.json()).toMatchObject({
      reason: "running",
      detail: expect.stringMatching(/Wait.*Pause/),
    });
    expect(h.deps.db.prepare("SELECT count(*) AS n FROM rebuild_admissions").get()?.n).toBe(1);
    const paused = { ...input, idempotencyKey: randomUUID() };
    expect((await post("/pause", paused)).status).toBe(200);
    expect((await post("/resume", paused)).status).toBe(409);
  } finally {
    h.close();
  }
});
