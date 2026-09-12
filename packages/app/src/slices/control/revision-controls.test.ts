import { expect, it, vi } from "vitest";
import { projectById, setProjectPaused } from "../admission/repo.js";
import { cancelProject } from "../cancel/index.js";
import { mutationFixture } from "../revisions/mutation.fake.js";
import { saveRevision } from "../revisions/mutations.js";
import { type ControlDeps, pauseProject, resumeProject } from "./index.js";

const key = "00000000-0000-4000-8000-000000000001";
async function fixture() {
  const h = await mutationFixture();
  h.deps.db
    .prepare(
      "INSERT INTO stages(id,project_id,kind,source,state) VALUES ('audio-control',?,'audio','generate','pending') ON CONFLICT(project_id,kind) DO UPDATE SET source='generate',state='pending'",
    )
    .run(h.projectId);
  const abort = vi.fn(async (): Promise<void> => undefined);
  const tick = vi.fn();
  const deps: ControlDeps = {
    ...h.deps,
    runner: {
      tick,
      abortProject: abort,
      abortAll: async () => undefined,
      settled: async () => undefined,
    },
    emit: () => undefined,
    providers: async () => [],
    modelsFor: async () => [],
  };
  return {
    ...h,
    deps,
    abort,
    tick,
    request: { baseRevisionId: h.base.revision.id, idempotencyKey: key },
  };
}
it("rejects missing or stale revision controls before changing state or aborting", async () => {
  const h = await fixture();
  try {
    expect(await pauseProject(h.deps, h.projectId)).toMatchObject({
      ok: false,
      reason: "revision-required",
    });
    expect(
      await pauseProject(h.deps, h.projectId, { ...h.request, baseRevisionId: "stale" }),
    ).toMatchObject({ ok: false, reason: "conflict" });
    expect(projectById(h.deps.db, h.projectId)?.paused).not.toBe(true);
    expect(h.abort).not.toHaveBeenCalled();
  } finally {
    h.close();
  }
});
it("replays a pause receipt after a newer save without pausing new work", async () => {
  const h = await fixture();
  try {
    expect(await pauseProject(h.deps, h.projectId, h.request)).toEqual({ ok: true });
    const changed = await saveRevision(h.deps, {
      projectId: h.projectId,
      baseRevisionId: h.base.revision.id,
      idempotencyKey: "new-title",
      edit: {
        config: { ...h.base.revision.config, title: "New revision" },
        content: h.base.revision.content,
      },
    });
    if (!changed.ok) throw new Error(JSON.stringify(changed));
    setProjectPaused(h.deps.db, h.projectId, false, h.deps.clock.now().toISOString());
    expect(await pauseProject(h.deps, h.projectId, h.request)).toEqual({ ok: true });
    expect(projectById(h.deps.db, h.projectId)?.paused).toBe(false);
    expect(h.abort).toHaveBeenCalledTimes(1);
    expect(
      await pauseProject(h.deps, h.projectId, {
        ...h.request,
        baseRevisionId: changed.view.revision.id,
      }),
    ).toMatchObject({ ok: false, reason: "idempotency-conflict" });
  } finally {
    h.close();
  }
});
it("shares control receipt keys with save and refuses unreviewed resume", async () => {
  const h = await fixture();
  try {
    expect(await pauseProject(h.deps, h.projectId, h.request)).toEqual({ ok: true });
    expect(
      await saveRevision(h.deps, {
        projectId: h.projectId,
        baseRevisionId: h.base.revision.id,
        idempotencyKey: key,
        edit: { config: h.base.revision.config, content: h.base.revision.content },
      }),
    ).toMatchObject({ ok: false, reason: "idempotency-conflict" });
    expect(await resumeProject(h.deps, h.projectId)).toMatchObject({
      ok: false,
      reason: "rebuild-required",
    });
    expect(h.tick).not.toHaveBeenCalled();
  } finally {
    h.close();
  }
});
it("cancels historical draining work once even without a current running stage", async () => {
  const h = await fixture();
  try {
    const deps = { ...h.deps, abort: h.abort, hasInflight: () => true };
    const first = await cancelProject(deps, h.projectId, h.request);
    expect(first.ok).toBe(true);
    expect(h.abort).toHaveBeenCalledTimes(1);
    expect(await cancelProject(deps, h.projectId, h.request)).toEqual(first);
    expect(h.abort).toHaveBeenCalledTimes(1);
    expect(await pauseProject(h.deps, h.projectId, h.request)).toMatchObject({
      ok: false,
      reason: "idempotency-conflict",
    });
  } finally {
    h.close();
  }
});

it("reserves a control request key before awaiting an abort", async () => {
  const h = await fixture();
  let release = (): void => undefined;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  h.abort.mockImplementation(async () => pending);
  const paused = pauseProject(h.deps, h.projectId, h.request);
  try {
    await expect.poll(() => h.abort.mock.calls.length).toBe(1);
    expect(
      await saveRevision(h.deps, {
        projectId: h.projectId,
        baseRevisionId: h.base.revision.id,
        idempotencyKey: key,
        edit: { config: h.base.revision.config, content: h.base.revision.content },
      }),
    ).toMatchObject({ ok: false, reason: "idempotency-conflict" });
  } finally {
    release();
    await paused;
    h.close();
  }
});

it("does not replay unfinished control effects against a newer revision", async () => {
  const h = await fixture();
  try {
    h.abort.mockRejectedValueOnce(new Error("Abort infrastructure unavailable"));
    await expect(pauseProject(h.deps, h.projectId, h.request)).rejects.toThrow(
      "Abort infrastructure unavailable",
    );
    const saved = await saveRevision(h.deps, {
      projectId: h.projectId,
      baseRevisionId: h.base.revision.id,
      idempotencyKey: "later",
      edit: {
        config: { ...h.base.revision.config, title: "Later" },
        content: h.base.revision.content,
      },
    });
    if (!saved.ok) throw new Error(JSON.stringify(saved));
    setProjectPaused(h.deps.db, h.projectId, false, h.deps.clock.now().toISOString());
    expect(await pauseProject(h.deps, h.projectId, h.request)).toMatchObject({
      ok: false,
      reason: "conflict",
    });
    expect(h.abort).toHaveBeenCalledTimes(1);
    expect(projectById(h.deps.db, h.projectId)?.paused).toBe(false);
  } finally {
    h.close();
  }
});
