import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { addedOutputPreviewSchema, addedOutputSchema } from "../../slices/outputs/model.js";
import { paidServiceFixture } from "../../slices/rebuild/service.fake.js";
import { createHub } from "../events/hub.js";
import { createApp } from "./app.js";

it("previews and adds a PDF to an existing project as a new revision, refusing repeats", async () => {
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
    const base = h.base.revision.id;
    const preview = await post("outputs/preview", { baseRevisionId: base, kind: "pdf" });
    expect(preview.status).toBe(200);
    const shown = addedOutputPreviewSchema.parse(await preview.json());
    expect(shown.created).toContain("The PDF, with a linked contents page");
    expect(shown.reused).toContain("Accepted article text");
    expect(shown.estimate.high).toBe(0);

    const unknown = await post("outputs/preview", { baseRevisionId: base, kind: "hologram" });
    expect(unknown.status).toBe(400);
    // A podcast rewrites the article as a conversation: it says so, and Add needs it accepted.
    const podcast = await post("outputs/preview", { baseRevisionId: base, kind: "podcast" });
    expect(podcast.status).toBe(200);
    expect(addedOutputPreviewSchema.parse(await podcast.json()).adapts).toBe(true);
    const unaccepted = await post("outputs", {
      baseRevisionId: base,
      kind: "podcast",
      idempotencyKey: randomUUID(),
    });
    expect(unaccepted.status).toBe(409);
    expect(await unaccepted.json()).toMatchObject({ reason: "adaptation-not-accepted" });

    const added = await post("outputs", {
      baseRevisionId: base,
      kind: "pdf",
      idempotencyKey: randomUUID(),
    });
    expect(added.status).toBe(200);
    const value = addedOutputSchema.parse(await added.json());
    expect(value.view.revision.parentId).toBe(base);
    expect(value.view.revision.config.sources.document).toBe("generate");
    expect(value.workKeys.length).toBeGreaterThan(0);
    // Nothing the project already made is asked for again.
    expect(value.workKeys.every((key) => !key.startsWith("image:"))).toBe(true);

    const again = await post("outputs/preview", {
      baseRevisionId: value.view.revision.id,
      kind: "pdf",
    });
    expect(again.status).toBe(409);
    expect(await again.json()).toMatchObject({ reason: "already" });
    const stale = await post("outputs/preview", { baseRevisionId: base, kind: "narration" });
    expect(stale.status).toBe(409);
  } finally {
    h.close();
  }
});
