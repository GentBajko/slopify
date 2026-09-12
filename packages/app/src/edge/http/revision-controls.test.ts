import { expect, it, vi } from "vitest";
import { projectById, setProjectPaused } from "../../slices/admission/repo.js";
import { mutationFixture } from "../../slices/revisions/mutation.fake.js";
import { saveRevision } from "../../slices/revisions/mutations.js";
import { createHub } from "../events/hub.js";
import { createApp } from "./app.js";

it("requires current revision control bodies and replays completed controls without stale effects", async () => {
  const h = await mutationFixture();
  try {
    h.deps.db
      .prepare(
        "INSERT INTO stages(id,project_id,kind,source,state) VALUES ('audio-control',?,'audio','generate','pending')",
      )
      .run(h.projectId);
    const tick = vi.fn();
    const abort = vi.fn(async () => undefined);
    const app = createApp({
      ...h.deps,
      hub: createHub(h.deps),
      version: "test",
      webDist: "/unused",
      runner: {
        tick,
        abortProject: abort,
        abortAll: async () => undefined,
        settled: async () => undefined,
      },
      flushSoon: () => undefined,
      probe: async () => ({ ran: false, stdout: "" }),
    });
    const endpoint = `/api/projects/${h.projectId}`;
    expect((await app.request(`${endpoint}/pause`, { method: "POST" })).status).toBe(409);
    const post = (path: string, value: unknown) =>
      app.request(endpoint + path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(value),
      });
    const request = {
      baseRevisionId: h.base.revision.id,
      idempotencyKey: "00000000-0000-4000-8000-000000000001",
    };
    expect((await post("/pause", { ...request, baseRevisionId: "stale" })).status).toBe(409);
    expect((await post("/pause", { ...request, idempotencyKey: "invalid" })).status).toBe(409);
    expect(abort).not.toHaveBeenCalled();
    expect((await post("/pause", request)).status).toBe(200);
    expect(abort).toHaveBeenCalledTimes(1);
    const changed = await saveRevision(h.deps, {
      projectId: h.projectId,
      baseRevisionId: h.base.revision.id,
      idempotencyKey: "rename",
      edit: {
        config: { ...h.base.revision.config, title: "New revision" },
        content: h.base.revision.content,
      },
    });
    if (!changed.ok) throw new Error(JSON.stringify(changed));
    setProjectPaused(h.deps.db, h.projectId, false, h.deps.clock.now().toISOString());
    expect((await post("/pause", request)).status).toBe(200);
    expect(projectById(h.deps.db, h.projectId)?.paused).toBe(false);
    expect((await post("/cancel", request)).status).toBe(409);
    expect((await app.request(`${endpoint}/resume`, { method: "POST" })).status).toBe(409);
    expect((await app.request(`${endpoint}/stages/audio/retry`, { method: "POST" })).status).toBe(
      409,
    );
    expect(abort).toHaveBeenCalledTimes(1);
    expect(tick).not.toHaveBeenCalled();
    expect(
      (
        await post("/cancel", {
          baseRevisionId: changed.view.revision.id,
          idempotencyKey: "00000000-0000-4000-8000-000000000002",
        })
      ).status,
    ).toBe(200);
  } finally {
    h.close();
  }
});
