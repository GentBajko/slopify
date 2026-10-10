import { randomUUID } from "node:crypto";
import { expect, vi } from "vitest";
import { fakeTts } from "../src/adapters/fake/tts.js";
import type { Runner } from "../src/kernel/runner/index.js";
import { stagesOf } from "../src/slices/admission/repo.js";
import { cancelProject } from "../src/slices/cancel/index.js";
import {
  recoverCheckpointWork,
  settleReleasedCheckpoints,
} from "../src/slices/checkpoints/recovery.js";
import { waitingExternalReviews } from "../src/slices/reviews/external-waiting.js";
import { composedFixture, current, save, start, tone } from "./revision-rebuild.fake.js";

// A run whose narration is in flight while an External agent reviews its images, and what a test
// does to it: Cancel, a restart, waiting for the runner. Each fixture's closers go in `closers`,
// which the test file empties after each test.

export async function settleUntil(runner: Runner, done: () => boolean): Promise<void> {
  await vi.waitFor(
    async () => {
      await runner.settled();
      expect(done(), "The run never reached the expected state.").toBe(true);
    },
    { timeout: 4_000, interval: 20 },
  );
}

// Narration in flight, held on its provider call, while both images wait for an External
// agent's review.
export async function narratingWhileAgentsReview(closers: (() => void)[]) {
  const audio = fakeTts({ bytesFor: () => [tone()] });
  const call = { blocks: true };
  const h = await composedFixture({
    tts: () => ({
      ...audio,
      synthesize: async (request) => {
        if (call.blocks)
          await new Promise((_resolve, reject) =>
            request.signal.addEventListener("abort", () => reject(new Error("aborted"))),
          );
        return audio.synthesize(request);
      },
    }),
  });
  closers.push(() => h.audioPreviews.close());
  const base = current(h.deps, h.projectId);
  await save(h.deps, h.projectId, {
    config: {
      ...base.revision.config,
      sources: { ...base.revision.config.sources, audio: "generate" },
      audio: { provider: "openai-tts", model: "tts", voice: "first" },
      provided: { article: "abcd" },
      reviews: {
        provider: "",
        model: "",
        reviewer: "agent",
        retries: 1,
        stages: { images: { mode: "flag" } },
      },
    },
    content: base.revision.content,
  });
  await start(h.deps, h.projectId, Object.keys(current(h.deps, h.projectId).revision.fingerprints));
  await vi.waitFor(
    () => {
      expect(waitingExternalReviews(h.deps.db, h.projectId)).toHaveLength(2);
      expect(stagesOf(h.deps.db, h.projectId).find((stage) => stage.kind === "audio")?.state).toBe(
        "running",
      );
    },
    { timeout: 4_000 },
  );
  return { h, call };
}

// What boot does before anything runs (`main.ts`): recover the work, then wire a new runner.
export function boot(h: AgentReviewRun, closers: (() => void)[]) {
  recoverCheckpointWork(h.deps.db);
  const next = h.compose(h.deps);
  closers.push(() => next.audioPreviews.close());
  return next;
}

// Cancel on the project's page (`POST /api/projects/:id/cancel`).
export async function cancel(h: AgentReviewRun) {
  expect(
    await cancelProject(
      {
        ...h.deps,
        abort: (id) => h.runner.abortProject(id),
        settleCheckpoints: (projectId) => settleReleasedCheckpoints(h.deps, projectId),
        emit: () => undefined,
      },
      h.projectId,
      { baseRevisionId: current(h.deps, h.projectId).revision.id, idempotencyKey: randomUUID() },
    ),
  ).toMatchObject({ ok: true, state: "canceled" });
  await h.runner.settled();
}

type AgentReviewRun = Awaited<ReturnType<typeof narratingWhileAgentsReview>>["h"];
