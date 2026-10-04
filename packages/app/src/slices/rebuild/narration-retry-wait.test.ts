import { expect, it, vi } from "vitest";
import { mutationFixture } from "../revisions/mutation.fake.js";
import {
  createNarrationRetries,
  pendingNarrationRetries,
  requestNarrationRetry,
} from "./narration-retry.js";
import { createRebuildDeps } from "./service.fake.js";

const answers: { ok: boolean; reason?: string }[] = [];
vi.mock("./recovery.js", () => ({
  recoverProject: vi.fn(async () => answers.shift() ?? { ok: false, reason: "running" }),
}));

it("waits while the project's other steps run, then records the chunk again", async () => {
  const h = await mutationFixture();
  try {
    const rebuild = createRebuildDeps(h.deps);
    requestNarrationRetry(h.deps.db, {
      projectId: h.projectId,
      chunkKey: "audio:body:chunk-1",
      now: "2026-09-30T00:00:00.000Z",
    });
    const retries = createNarrationRetries();
    retries.bind(rebuild.deps);
    // Busy: the retry stays asked for, not failed.
    answers.push({ ok: false, reason: "running" });
    retries.kick(h.projectId);
    await expect.poll(() => rebuild.ticks).toContain(h.projectId);
    expect(pendingNarrationRetries(h.deps.db, h.projectId)).toHaveLength(1);
    // The busy step finished and kicked it again: now it starts.
    answers.push({ ok: true });
    retries.kick(h.projectId);
    await expect.poll(() => pendingNarrationRetries(h.deps.db, h.projectId)).toEqual([]);
    expect(
      h.deps.db.prepare("SELECT state FROM narration_retries WHERE project_id=?").get(h.projectId)
        ?.state,
    ).toBe("started");
  } finally {
    h.close();
  }
});

it("looks again by itself when the step that kicked it still counted as running", async () => {
  const h = await mutationFixture();
  vi.useFakeTimers({ toFake: ["setTimeout"], shouldAdvanceTime: true });
  try {
    const rebuild = createRebuildDeps(h.deps);
    requestNarrationRetry(h.deps.db, {
      projectId: h.projectId,
      chunkKey: "audio:body:chunk-2",
      now: "2026-09-30T00:00:00.000Z",
    });
    const retries = createNarrationRetries();
    retries.bind(rebuild.deps);
    answers.push({ ok: false, reason: "running" }, { ok: true });
    retries.kick(h.projectId);
    await expect.poll(() => rebuild.ticks).toContain(h.projectId);
    expect(pendingNarrationRetries(h.deps.db, h.projectId)).toHaveLength(1);
    // Nothing kicks it again: after the wait it starts on its own.
    await vi.advanceTimersByTimeAsync(15_000);
    await expect.poll(() => pendingNarrationRetries(h.deps.db, h.projectId)).toEqual([]);
  } finally {
    vi.useRealTimers();
    h.close();
  }
});
