import { expect, it } from "vitest";
import type { LogFields, LogLevel } from "../../kernel/log.js";
import { mutationFixture } from "../revisions/mutation.fake.js";
import {
  createNarrationRetries,
  narrationRetryLimit,
  pendingNarrationRetries,
  requestNarrationRetry,
  retryKey,
} from "./narration-retry.js";
import { createRebuildDeps } from "./service.fake.js";

it("gives a chunk two tries, then none", async () => {
  const h = await mutationFixture();
  try {
    const ask = () =>
      requestNarrationRetry(h.deps.db, {
        projectId: h.projectId,
        chunkKey: "audio:body:a-1",
        now: "2026-09-29T00:00:00.000Z",
      });
    expect(narrationRetryLimit).toBe(2);
    expect(ask()).toBe(1);
    expect(pendingNarrationRetries(h.deps.db, h.projectId)).toEqual([
      { projectId: h.projectId, chunkKey: "audio:body:a-1", tries: 1 },
    ]);
    expect(ask()).toBe(2);
    expect(ask()).toBeUndefined();
    // Another chunk has its own tries.
    expect(
      requestNarrationRetry(h.deps.db, {
        projectId: h.projectId,
        chunkKey: "audio:body:b-1",
        now: "2026-09-29T00:00:00.000Z",
      }),
    ).toBe(1);
  } finally {
    h.close();
  }
});

it("names each try with its own stable request key", () => {
  const one = { projectId: "p", chunkKey: "audio:body:a-1", tries: 1 };
  expect(retryKey(one)).toBe(retryKey({ ...one }));
  expect(retryKey(one)).not.toBe(retryKey({ ...one, tries: 2 }));
  expect(retryKey(one)).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/);
});

it("records why a retry couldn't start and wakes the project", async () => {
  const h = await mutationFixture();
  try {
    const rebuild = createRebuildDeps(h.deps);
    const warnings: string[] = [];
    const deps = {
      ...rebuild.deps,
      log: {
        write: (_level: LogLevel, _event: string, fields?: LogFields) => {
          warnings.push(fields?.detail ?? "");
        },
      },
    };
    requestNarrationRetry(h.deps.db, {
      projectId: h.projectId,
      chunkKey: "audio:body:missing-1",
      now: "2026-09-29T00:00:00.000Z",
    });
    const retries = createNarrationRetries();
    retries.bind(deps);
    retries.kick(h.projectId);
    await expect.poll(() => pendingNarrationRetries(h.deps.db, h.projectId)).toEqual([]);
    const row = h.deps.db
      .prepare("SELECT state, detail FROM narration_retries WHERE project_id=?")
      .get(h.projectId);
    expect(row?.state).toBe("failed");
    expect(String(row?.detail)).not.toBe("");
    await expect.poll(() => rebuild.ticks).toContain(h.projectId);
    expect(warnings.some((one) => one.includes("audio:body:missing-1"))).toBe(true);
  } finally {
    h.close();
  }
});
