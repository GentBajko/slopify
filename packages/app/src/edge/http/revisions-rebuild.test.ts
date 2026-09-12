import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { z } from "zod";
import { rebuildAdmissionSchema, rebuildPreviewSchema } from "../../slices/rebuild/model.js";
import { paidServiceFixture } from "../../slices/rebuild/service.fake.js";
import { revisionMutationSuccessSchema } from "../../slices/revisions/schema.js";
import { createHub } from "../events/hub.js";
import { createApp } from "./app.js";

const previewResponse = z.object({ ok: z.literal(true), value: rebuildPreviewSchema });
const admissionResponse = z.object({ ok: z.literal(true), value: rebuildAdmissionSchema });

it("previews selected costs without effects, admits once and returns stable rebuild receipts", async () => {
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
    const post = (path: string, input: unknown) =>
      app.request(`/api/projects/${h.projectId}/${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      });
    const preview = await post("rebuild/preview", {
      baseRevisionId: h.base.revision.id,
      request: { kind: "selected", workKeys: ["image:one"] },
    });
    expect(preview.status).toBe(200);
    const value = previewResponse.parse(await preview.json()).value;
    expect(value.costs.high).toBe(0.04);
    expect(h.ticks).toEqual([]);
    expect(h.readinessCalls).toEqual([]);
    const invalid = await post("rebuild/preview", {
      baseRevisionId: h.base.revision.id,
      request: { kind: "selected", workKeys: ["missing"] },
    });
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toMatchObject({
      reason: "invalid-selection",
      currentRevisionId: h.base.revision.id,
    });
    const input = {
      baseRevisionId: h.base.revision.id,
      previewId: value.id,
      idempotencyKey: randomUUID(),
      acknowledgeUnknownCosts: true,
      confirmedProvidedWorkKeys: value.providedReuseRequired,
    };
    const refused = await post("rebuild", { ...input, confirmedProvidedWorkKeys: ["extra"] });
    expect(refused.status).toBe(409);
    expect(await refused.json()).toMatchObject({ reason: "review-required" });
    const started = await post("rebuild", input);
    expect(started.status).toBe(202);
    const admitted = admissionResponse.parse(await started.json());
    expect(admitted.value.workIds).toHaveLength(1);
    expect(h.ticks).toEqual([h.projectId]);
    expect(h.readinessCalls.length).toBeGreaterThan(0);
    const save = await post("revisions", {
      baseRevisionId: h.base.revision.id,
      idempotencyKey: randomUUID(),
      edit: {
        config: { ...h.base.revision.config, title: "A newer revision" },
        content: h.base.revision.content,
      },
    });
    expect(save.status).toBe(200);
    const current = revisionMutationSuccessSchema.parse(await save.json());
    const replay = await post("rebuild", input);
    expect(replay.status).toBe(202);
    expect(admissionResponse.parse(await replay.json())).toEqual({
      ok: true,
      value: { ...admitted.value, replayed: true },
    });
    const stale = await post("rebuild", { ...input, idempotencyKey: randomUUID() });
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({
      reason: "conflict",
      currentRevisionId: current.view.revision.id,
    });
    expect(h.deps.db.prepare("SELECT count(*) AS n FROM rebuild_admissions").get()?.n).toBe(1);
  } finally {
    h.close();
  }
});
