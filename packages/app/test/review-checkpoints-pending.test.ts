import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { pauseProject, resumeProject } from "../src/slices/control/index.js";
import { checkpointFixture } from "./e2e/review-checkpoints.http.js";
import { current, save } from "./revision-rebuild.fake.js";

it("adds a gate when all unsubmitted work was carried across a title-only Save", async () => {
  const h = await checkpointFixture();
  try {
    await h.admit();
    const before = h.deps.db
      .prepare(
        "SELECT work_id,piece_id FROM revision_work_reservations WHERE revision_id=? ORDER BY work_key",
      )
      .all(current(h.deps, h.projectId).revision.id);
    const base = current(h.deps, h.projectId);
    await save(h.deps, h.projectId, {
      config: { ...base.revision.config, title: "Title only" },
      content: base.revision.content,
    });
    expect((await h.change(["images"])).status).toBe(200);
    expect(
      h.deps.db
        .prepare(
          "SELECT work_id,piece_id FROM revision_work_reservations WHERE revision_id=? ORDER BY work_key",
        )
        .all(current(h.deps, h.projectId).revision.id),
    ).toEqual(before);
    expect(h.deps.db.prepare("SELECT count(*) AS n FROM attempts").get()?.n).toBe(0);
  } finally {
    await h.dispose();
  }
});

it.each([false, true])(
  "adds a gate before rebuilding saved images (all changed=%s)",
  async (all) => {
    const h = await checkpointFixture();
    try {
      await h.admit();
      h.runner.tick(h.projectId);
      await h.runner.settled();
      const base = current(h.deps, h.projectId);
      await save(h.deps, h.projectId, {
        config: base.revision.config,
        content: {
          ...base.revision.content,
          imageDefinitions: {
            ...base.revision.content.imageDefinitions,
            one: { source: "generate", prompt: "Changed", assetId: null },
            ...(all
              ? { two: { source: "generate" as const, prompt: "Changed too", assetId: null } }
              : {}),
          },
        },
      });
      const calls = h.deps.db.prepare("SELECT count(*) AS n FROM attempts").get()?.n;
      expect((await h.change(["images"])).status).toBe(200);
      const gate = (await h.status()).checkpoints[0];
      if (!gate) throw new Error("Missing gate");
      expect(gate.state).toBe("held");
      expect((await h.approve(gate)).status).toBe(200);
      await h.runner.settled();
      expect(h.deps.db.prepare("SELECT count(*) AS n FROM attempts").get()?.n).toBe(calls);
      await h.admit();
      h.runner.tick(h.projectId);
      await h.runner.settled();
      expect(
        Number(h.deps.db.prepare("SELECT count(*) AS n FROM attempts").get()?.n),
      ).toBeGreaterThan(Number(calls));
    } finally {
      await h.dispose();
    }
  },
);

it("resumes already-admitted work after removing the last gate while paused", async () => {
  const h = await checkpointFixture();
  try {
    await h.admit();
    await h.change(["images"]);
    const control = { ...h.deps, modelsFor: async () => [] };
    expect(
      (
        await pauseProject(control, h.projectId, {
          baseRevisionId: current(h.deps, h.projectId).revision.id,
          idempotencyKey: randomUUID(),
        })
      ).ok,
    ).toBe(true);
    expect((await h.change([])).status).toBe(200);
    expect(h.deps.db.prepare("SELECT count(*) AS n FROM attempts").get()?.n).toBe(0);
    expect(await resumeProject(control, h.projectId)).toEqual({ ok: true });
    await h.runner.settled();
    expect(h.deps.db.prepare("SELECT count(*) AS n FROM attempts").get()?.n).toBe(2);
  } finally {
    await h.dispose();
  }
});
