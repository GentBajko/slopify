import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { expect, it } from "vitest";
import { fakeImage } from "../src/adapters/fake/image.js";
import { openDb } from "../src/kernel/db/index.js";
import { setProjectPaused } from "../src/slices/admission/repo.js";
import { changeCheckpoints, readCheckpointStatus } from "../src/slices/checkpoints/change.js";
import { recoverCheckpointWork } from "../src/slices/checkpoints/recovery.js";
import { listCheckpoints } from "../src/slices/checkpoints/repo.js";
import { pauseProject, resumeProject } from "../src/slices/control/index.js";
import { getRevisionView } from "../src/slices/revisions/view.js";
import { composedFixture, current, deferred, save, start } from "./revision-rebuild.fake.js";

it("restores a held multi-invocation gate and keeps pause authoritative after approval", async () => {
  const images = fakeImage();
  const h = await composedFixture({ image: () => images });
  let reopened: ReturnType<typeof openDb> | undefined;
  try {
    await start({ ...h.deps, runner: { ...h.runner, tick: () => undefined } }, h.projectId, [
      "image:one",
      "image:two",
    ]);
    const revisionId = current(h.deps, h.projectId).revision.id;
    expect(
      changeCheckpoints(h.deps, { projectId: h.projectId, revisionId, stages: ["images"] }).ok,
    ).toBe(true);
    h.runner.tick(h.projectId);
    await h.runner.settled();
    expect(images.calls()).toBe(0);
    const snapshot = join(h.deps.paths.dataDir, "gates.sqlite");
    h.deps.db.prepare("VACUUM INTO ?").run(snapshot);
    reopened = openDb(snapshot);
    recoverCheckpointWork(reopened);
    const next = h.compose({ ...h.deps, db: reopened });
    try {
      const status = readCheckpointStatus(next.deps, h.projectId);
      if (!status.ok || !status.value.checkpoints[0]) throw new Error("Missing restored gate");
      const gate = status.value.checkpoints[0];
      expect(gate.state).toBe("held");
      next.runner.tick(h.projectId);
      await next.runner.settled();
      expect(images.calls()).toBe(0);
      const control = { ...next.deps, modelsFor: async () => [] };
      expect(
        await pauseProject(control, h.projectId, {
          baseRevisionId: revisionId,
          idempotencyKey: randomUUID(),
        }),
      ).toEqual({ ok: true });
      const identity = { revisionId, fingerprint: gate.fingerprint, idempotencyKey: randomUUID() };
      expect(next.runner.checkpoints.release(h.projectId, gate.checkpointId, identity).ok).toBe(
        true,
      );
      await next.runner.settled();
      expect(images.calls()).toBe(0);
      expect(await resumeProject(control, h.projectId)).toEqual({ ok: true });
      next.runner.tick(h.projectId);
      await next.runner.settled();
      expect(images.calls()).toBe(2);
      expect(
        next.runner.checkpoints.release(h.projectId, gate.checkpointId, identity),
      ).toMatchObject({ ok: false, reason: "duplicate" });
      next.runner.tick(h.projectId);
      await next.runner.settled();
      expect(images.calls()).toBe(2);
      expect(listCheckpoints(reopened, h.projectId, revisionId)[0]?.state).toBe("released");
    } finally {
      await next.runner.settled();
      next.audioPreviews.close();
    }
  } finally {
    reopened?.close();
    h.audioPreviews.close();
    await h.runner.settled();
    h.close();
  }
});

it("invalidates changed gates while a submitted late result stays on its origin", async () => {
  const entered = deferred<void>();
  const finish = deferred<void>();
  const images = fakeImage();
  const h = await composedFixture({
    image: () => ({
      ...images,
      generate: async (request) => {
        entered.resolve();
        await finish.promise;
        return images.generate(request);
      },
    }),
  });
  try {
    await start({ ...h.deps, runner: { ...h.runner, tick: () => undefined } }, h.projectId, [
      "image:one",
    ]);
    const base = current(h.deps, h.projectId);
    expect(
      changeCheckpoints(h.deps, {
        projectId: h.projectId,
        revisionId: base.revision.id,
        stages: ["images"],
      }).ok,
    ).toBe(true);
    const gate = listCheckpoints(h.deps.db, h.projectId, base.revision.id)[0];
    if (!gate) throw new Error("Missing gate");
    expect(
      h.runner.checkpoints.release(h.projectId, gate.checkpointId, {
        revisionId: gate.revisionId,
        fingerprint: gate.fingerprint,
        idempotencyKey: randomUUID(),
      }).ok,
    ).toBe(true);
    await entered.promise;
    const next = await save(h.deps, h.projectId, {
      config: base.revision.config,
      content: {
        ...base.revision.content,
        imageDefinitions: {
          ...base.revision.content.imageDefinitions,
          one: { source: "generate", prompt: "Changed", assetId: null },
        },
      },
    });
    expect(listCheckpoints(h.deps.db, h.projectId, base.revision.id)[0]?.state).toBe("invalidated");
    expect(listCheckpoints(h.deps.db, h.projectId, next.revision.id)[0]).toMatchObject({
      state: "held",
      approvedAt: null,
    });
    finish.resolve();
    await h.runner.settled();
    expect(
      getRevisionView(h.deps, h.projectId, base.revision.id)?.outputs.some(
        (row) => row.workKey === "image:one" && row.available,
      ),
    ).toBe(true);
    expect(
      current(h.deps, h.projectId).outputs.some(
        (row) => row.workKey === "image:one" && row.available,
      ),
    ).toBe(false);
    expect(images.calls()).toBe(1);
  } finally {
    finish.resolve();
    await h.runner.settled();
    h.audioPreviews.close();
    h.close();
  }
});

it("carries an unchanged approval to a new head without duplicating admitted work", async () => {
  const images = fakeImage();
  const h = await composedFixture({ image: () => images });
  try {
    await start({ ...h.deps, runner: { ...h.runner, tick: () => undefined } }, h.projectId, [
      "image:one",
      "image:two",
    ]);
    const base = current(h.deps, h.projectId);
    expect(
      changeCheckpoints(h.deps, {
        projectId: h.projectId,
        revisionId: base.revision.id,
        stages: ["images"],
      }).ok,
    ).toBe(true);
    const gate = listCheckpoints(h.deps.db, h.projectId, base.revision.id)[0];
    if (!gate) throw new Error("Missing gate");
    setProjectPaused(h.deps.db, h.projectId, true, h.deps.clock.now().toISOString());
    expect(
      h.runner.checkpoints.release(h.projectId, gate.checkpointId, {
        revisionId: gate.revisionId,
        fingerprint: gate.fingerprint,
        idempotencyKey: randomUUID(),
      }).ok,
    ).toBe(true);
    await h.runner.settled();
    const next = await save(h.deps, h.projectId, {
      config: { ...base.revision.config, title: "Only the title changed" },
      content: base.revision.content,
    });
    expect(listCheckpoints(h.deps.db, h.projectId, next.revision.id)[0]).toMatchObject({
      state: "released",
      fingerprint: gate.fingerprint,
    });
    setProjectPaused(h.deps.db, h.projectId, false, h.deps.clock.now().toISOString());
    h.runner.tick(h.projectId);
    await h.runner.settled();
    expect(images.calls()).toBe(2);
  } finally {
    await h.runner.settled();
    h.audioPreviews.close();
    h.close();
  }
});
