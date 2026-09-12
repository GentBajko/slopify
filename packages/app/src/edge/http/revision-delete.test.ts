import { existsSync } from "node:fs";
import { expect, it, vi } from "vitest";
import { mutationFixture } from "../../slices/revisions/mutation.fake.js";
import { saveRevision } from "../../slices/revisions/mutations.js";
import { projectDir } from "../../slices/storage/layout.js";
import { createHub } from "../events/hub.js";
import { createApp } from "./app.js";

it("keeps revision history while an original request drains, then permits explicit deletion", async () => {
  const h = await mutationFixture();
  try {
    const saved = await saveRevision(h.deps, {
      projectId: h.projectId,
      baseRevisionId: h.base.revision.id,
      idempotencyKey: "new-head",
      edit: {
        config: { ...h.base.revision.config, title: "New head" },
        content: h.base.revision.content,
      },
    });
    if (!saved.ok) throw new Error(JSON.stringify(saved));
    h.deps.db.prepare("UPDATE stages SET state='done' WHERE project_id=?").run(h.projectId);
    let draining = true;
    const hasInflight = vi.fn((projectId: string) => projectId === h.projectId && draining);
    const tick = vi.fn();
    const abortProject = vi.fn(async () => undefined);
    const app = createApp({
      ...h.deps,
      hub: createHub(h.deps),
      version: "test",
      webDist: "/unused",
      runner: {
        hasInflight,
        tick,
        abortProject,
        abortAll: async () => undefined,
        settled: async () => undefined,
      },
      flushSoon: () => undefined,
      probe: async () => ({ ran: false, stdout: "" }),
    });
    const endpoint = `/api/projects/${h.projectId}`;
    const response = await app.request(endpoint, { method: "DELETE" });
    expect(response.status).toBe(409);
    expect(hasInflight).toHaveBeenCalledWith(h.projectId);
    expect(h.deps.db.prepare("SELECT count(*) AS n FROM project_revisions").get()?.n).toBe(2);
    expect(existsSync(projectDir(h.deps.paths, h.projectId))).toBe(true);
    draining = false;
    expect((await app.request(endpoint, { method: "DELETE" })).status).toBe(204);
    expect(h.deps.db.prepare("SELECT count(*) AS n FROM project_revisions").get()?.n).toBe(0);
    expect(h.deps.db.prepare("SELECT count(*) AS n FROM project_assets").get()?.n).toBe(0);
    expect(existsSync(projectDir(h.deps.paths, h.projectId))).toBe(false);
    expect(tick).not.toHaveBeenCalled();
    expect(abortProject).not.toHaveBeenCalled();
  } finally {
    h.close();
  }
});
