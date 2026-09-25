import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { deferred } from "../../../test/revision-rebuild.fake.js";
import { cancelProject } from "../cancel/index.js";
import { settleReleasedCheckpoints } from "../checkpoints/recovery.js";
import { pauseProject } from "../control/index.js";
import { saveRevision } from "../revisions/mutations.js";
import { currentRevisionId } from "../revisions/repo.js";
import { deleteKey, upsertKey } from "../settings/repo.js";
import { recoverProject } from "./recovery.js";
import { exportFixture } from "./runtime-export.fake.js";
import { createRebuildDeps, paidServiceFixture } from "./service.fake.js";

it.each(["pause", "cancel"] as const)(
  "replays without undoing a later %s, edit or failure",
  async (operation) => {
    const h = await paidServiceFixture();
    try {
      const input = {
        baseRevisionId: h.base.revision.id,
        idempotencyKey: randomUUID(),
        action: { kind: "resume" as const },
      };
      const first = await recoverProject(h.deps, h.projectId, input);
      expect(first.ok).toBe(true);
      const control = { baseRevisionId: input.baseRevisionId, idempotencyKey: randomUUID() };
      if (operation === "pause") await pauseProject(h.deps, h.projectId, control);
      else
        await cancelProject(
          {
            ...h.deps,
            abort: h.deps.runner.abortProject,
            settleCheckpoints: (id) => settleReleasedCheckpoints(h.deps, id),
          },
          h.projectId,
          control,
        );
      h.deps.db
        .prepare("UPDATE revision_work SET state='failed',dispatch_state='held' WHERE project_id=?")
        .run(h.projectId);
      const saved = await saveRevision(h.deps, {
        projectId: h.projectId,
        baseRevisionId: input.baseRevisionId,
        idempotencyKey: randomUUID(),
        edit: {
          config: { ...h.base.revision.config, title: "Later" },
          content: h.base.revision.content,
        },
      });
      expect(saved.ok).toBe(true);
      const snapshot = h.deps.db.prepare("SELECT * FROM revision_work ORDER BY id").all();
      const paused = h.deps.db
        .prepare("SELECT paused FROM project_controls WHERE project_id=?")
        .get(h.projectId);
      const ticks = h.ticks.length;
      expect(await recoverProject(h.deps, h.projectId, input)).toEqual(first);
      expect(h.deps.db.prepare("SELECT * FROM revision_work ORDER BY id").all()).toEqual(snapshot);
      expect(
        h.deps.db
          .prepare("SELECT paused FROM project_controls WHERE project_id=?")
          .get(h.projectId),
      ).toEqual(paused);
      expect(h.ticks).toHaveLength(ticks);
    } finally {
      h.close();
    }
  },
);

it("keeps exactly one regeneration revision after admission readiness fails", async () => {
  const h = await paidServiceFixture();
  try {
    const deps = { ...h.deps, providers: async () => [] };
    const input = {
      baseRevisionId: h.base.revision.id,
      idempotencyKey: randomUUID(),
      action: { kind: "rerun" as const, stage: "images" as const },
    };
    const before = h.deps.db.prepare("SELECT count(*) AS n FROM project_revisions").get()?.n;
    const first = await recoverProject(deps, h.projectId, input);
    expect(first).toMatchObject({
      ok: false,
      reason: "readiness",
      intentRevisionId: currentRevisionId(h.deps.db, h.projectId),
    });
    const count = h.deps.db.prepare("SELECT count(*) AS n FROM project_revisions").get()?.n;
    expect(Number(count)).toBe(Number(before) + 1);
    expect(await recoverProject(h.deps, h.projectId, input)).toEqual(first);
    expect(h.deps.db.prepare("SELECT count(*) AS n FROM project_revisions").get()?.n).toBe(count);
    const head = currentRevisionId(h.deps.db, h.projectId);
    if (!head) throw new Error("Missing saved intent");
    expect(
      (
        await recoverProject(h.deps, h.projectId, {
          baseRevisionId: head,
          idempotencyKey: randomUUID(),
          action: { kind: "resume" },
        })
      ).ok,
    ).toBe(true);
    expect(h.deps.db.prepare("SELECT count(*) AS n FROM project_revisions").get()?.n).toBe(count);
  } finally {
    h.close();
  }
});

it.each([
  "pause",
  "cancel",
  "edit",
  "delete",
  "model",
  "replace-key",
  "reinsert-key",
  "unrelated-key",
] as const)("rechecks authority after asynchronous readiness: %s", async (change) => {
  const h = await paidServiceFixture();
  const entered = deferred<void>();
  const gate = deferred<void>();
  try {
    const at = h.deps.clock.now().toISOString();
    upsertKey(h.deps.db, "fal", "unit-test-placeholder", at);
    const pending = recoverProject(
      {
        ...h.deps,
        providers: async () => {
          const providers = await h.deps.providers();
          entered.resolve();
          await gate.promise;
          return providers;
        },
      },
      h.projectId,
      {
        baseRevisionId: h.base.revision.id,
        idempotencyKey: randomUUID(),
        action: { kind: "resume" },
      },
    );
    await entered.promise;
    const control = { baseRevisionId: h.base.revision.id, idempotencyKey: randomUUID() };
    if (change === "pause") await pauseProject(h.deps, h.projectId, control);
    if (change === "cancel")
      await cancelProject(
        {
          ...h.deps,
          abort: h.deps.runner.abortProject,
          settleCheckpoints: (id) => settleReleasedCheckpoints(h.deps, id),
        },
        h.projectId,
        control,
      );
    if (change === "edit")
      await saveRevision(h.deps, {
        projectId: h.projectId,
        ...control,
        edit: {
          config: { ...h.base.revision.config, title: "Newer" },
          content: h.base.revision.content,
        },
      });
    if (change === "delete") h.deps.db.prepare("DELETE FROM projects WHERE id=?").run(h.projectId);
    if (change === "model")
      h.setCatalogue({
        ...h.catalogue,
        image: h.catalogue.image.map((model) => ({ ...model, enabled: false })),
      });
    if (change === "reinsert-key") deleteKey(h.deps.db, "fal");
    if (change === "replace-key" || change === "reinsert-key")
      upsertKey(h.deps.db, "fal", "unit-test-placeholder", at);
    if (change === "unrelated-key") upsertKey(h.deps.db, "openrouter", "unit-test-placeholder", at);
    gate.resolve();
    const result = await pending;
    expect(result.ok).toBe(change === "unrelated-key");
    expect(h.deps.db.prepare("SELECT count(*) AS n FROM rebuild_admissions").get()?.n).toBe(
      change === "unrelated-key" ? 1 : 0,
    );
    if (change !== "unrelated-key") expect(h.ticks).toEqual([]);
  } finally {
    gate.resolve();
    h.close();
  }
});

it("does not silently confirm supplied audio or manual captions", async () => {
  const h = await exportFixture();
  try {
    const base = h.view();
    const saved = await saveRevision(h.deps, {
      projectId: h.projectId,
      baseRevisionId: base.revision.id,
      idempotencyKey: randomUUID(),
      edit: {
        config: base.revision.config,
        content: {
          ...base.revision.content,
          articleEdited: true,
          articleMarkdown: "A revised transcript.",
        },
      },
    });
    if (!saved.ok) throw new Error("Save refused");
    const helper = createRebuildDeps(h.deps);
    const result = await recoverProject(helper.deps, h.projectId, {
      baseRevisionId: saved.view.revision.id,
      idempotencyKey: randomUUID(),
      action: { kind: "resume" },
    });
    expect(result).toMatchObject({ ok: false, reason: "review-required" });
    expect(helper.ticks).toEqual([]);
    expect(h.deps.db.prepare("SELECT count(*) AS n FROM rebuild_admissions").get()?.n).toBe(0);
    expect(h.view().revision.content.subtitleCues).toEqual(
      saved.view.revision.content.subtitleCues,
    );
  } finally {
    h.close();
  }
});
