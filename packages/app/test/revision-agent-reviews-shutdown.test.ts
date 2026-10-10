import { randomUUID } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { fakeTts } from "../src/adapters/fake/tts.js";
import { derive, progressOf } from "../src/kernel/runner/graph.js";
import type { Runner } from "../src/kernel/runner/index.js";
import { stageStandingsByProject, stagesOf } from "../src/slices/admission/repo.js";
import { projectStateWord, runningNow } from "../src/slices/admission/state-words.js";
import { cancelProject } from "../src/slices/cancel/index.js";
import {
  recoverCheckpointWork,
  settleReleasedCheckpoints,
} from "../src/slices/checkpoints/recovery.js";
import { recoverProject } from "../src/slices/rebuild/recovery.js";
import { executionStandings } from "../src/slices/rebuild/runtime-store.js";
import { externalReviewWaitMs } from "../src/slices/reviews/external-model.js";
import {
  answerExternalReview,
  settleExternalReviews,
} from "../src/slices/reviews/external-repo.js";
import { waitingExternalReviews } from "../src/slices/reviews/external-waiting.js";
import { projectHolds } from "../src/slices/reviews/holds.js";
import { listVerdicts } from "../src/slices/reviews/repo.js";
import { composedFixture, current, save, start, tone } from "./revision-rebuild.fake.js";

const closers: (() => void)[] = [];
afterEach(() => {
  for (const close of closers.splice(0)) close();
});

async function settleUntil(runner: Runner, done: () => boolean): Promise<void> {
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
async function narratingWhileAgentsReview() {
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
function boot(h: Awaited<ReturnType<typeof narratingWhileAgentsReview>>["h"]) {
  recoverCheckpointWork(h.deps.db);
  const next = h.compose(h.deps);
  closers.push(() => next.audioPreviews.close());
  return next;
}

// Cancel on the project's page (`POST /api/projects/:id/cancel`).
async function cancel(h: Awaited<ReturnType<typeof narratingWhileAgentsReview>>["h"]) {
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

it("reads a run quit mid-way as Stopped after boot, its reviews live, and Continue goes on", async () => {
  const { h, call } = await narratingWhileAgentsReview();
  // The shutdown `main.ts` runs on Ctrl-C or an update install.
  await h.runner.abortAll();
  expect(stagesOf(h.deps.db, h.projectId).map((stage) => stage.state)).not.toContain("canceled");
  const next = boot(h);
  next.runner.tick(h.projectId);
  await next.runner.settled();
  expect(derive(stagesOf(h.deps.db, h.projectId))).toBe("pending");
  expect([...projectHolds(h.deps.db, { projectId: h.projectId }).stopped]).toEqual([h.projectId]);
  const reviews = waitingExternalReviews(h.deps.db, h.projectId);
  expect(reviews).toHaveLength(2);
  for (const review of reviews)
    expect(
      answerExternalReview(h.deps.db, {
        projectId: h.projectId,
        id: review.id,
        verdict: { passed: true, reasons: [] },
        by: "agent",
        at: new Date().toISOString(),
      }),
    ).toMatchObject({ ok: true });
  call.blocks = false;
  // Continue the run (`POST /api/projects/:id/resume`).
  expect(
    await recoverProject(next.deps, h.projectId, {
      baseRevisionId: current(h.deps, h.projectId).revision.id,
      idempotencyKey: randomUUID(),
      action: { kind: "resume" },
    }),
  ).toMatchObject({ ok: true });
  await settleUntil(next.runner, () => derive(stagesOf(h.deps.db, h.projectId)) === "done");
  expect(listVerdicts(h.deps.db, h.projectId).map((row) => row.outcome)).toEqual([
    "passed",
    "passed",
  ]);
});

it("keeps a run canceled mid-way canceled after boot, its reviews closed", async () => {
  const { h } = await narratingWhileAgentsReview();
  await cancel(h);
  const next = boot(h);
  next.runner.tick(h.projectId);
  await next.runner.settled();
  expect(derive(stagesOf(h.deps.db, h.projectId))).toBe("canceled");
  expect([...projectHolds(h.deps.db, { projectId: h.projectId }).stopped]).toEqual([]);
  expect(waitingExternalReviews(h.deps.db, h.projectId)).toEqual([]);
  expect(
    settleExternalReviews(h.deps.db, new Date(Date.now() + externalReviewWaitMs + 60_000)),
  ).toEqual([]);
});

it("lets the agent review images retried after a cancel, and the images step goes on", async () => {
  const { h } = await narratingWhileAgentsReview();
  await cancel(h);
  // Try images again on the canceled run's page.
  expect(
    await recoverProject(h.deps, h.projectId, {
      baseRevisionId: current(h.deps, h.projectId).revision.id,
      idempotencyKey: randomUUID(),
      action: { kind: "retry", stage: "images" },
    }),
  ).toMatchObject({ ok: true });
  await settleUntil(h.runner, () => waitingExternalReviews(h.deps.db, h.projectId).length === 2);
  const [answered, unanswered] = waitingExternalReviews(h.deps.db, h.projectId);
  if (answered === undefined || unanswered === undefined) throw new Error("two reviews expected");
  expect(
    answerExternalReview(h.deps.db, {
      projectId: h.projectId,
      id: answered.id,
      verdict: { passed: true, reasons: [] },
      by: "agent",
      at: new Date().toISOString(),
    }),
  ).toMatchObject({ ok: true });
  expect(
    settleExternalReviews(h.deps.db, new Date(Date.now() + externalReviewWaitMs + 60_000)).map(
      (row) => row.id,
    ),
  ).toEqual([unanswered.id]);
  h.runner.tick(h.projectId);
  await settleUntil(
    h.runner,
    () =>
      stagesOf(h.deps.db, h.projectId).find((stage) => stage.kind === "images")?.state === "done",
  );
  expect(
    listVerdicts(h.deps.db, h.projectId)
      .map((row) => row.outcome)
      .sort(),
  ).toEqual(["auto-passed", "passed"]);
});

// A canceled run's reviews wait for nobody, so their two hours stop: retried, the step asks
// again and its reviews wait their whole two hours from the retry.
for (const action of [{ kind: "retry", stage: "images" }, { kind: "resume" }] as const)
  it(`gives reviews of a run taken up after a cancel (${action.kind}) two hours from then`, async () => {
    const { h, call } = await narratingWhileAgentsReview();
    await cancel(h);
    // The cancel was three hours ago: the old deadlines are long past.
    h.deps.db
      .prepare(
        "UPDATE external_reviews SET waiting_since='2026-01-01T00:00:00.000Z', deadline_at='2026-01-01T02:00:00.000Z'",
      )
      .run();
    call.blocks = false;
    const retried = Date.now();
    expect(
      await recoverProject(h.deps, h.projectId, {
        baseRevisionId: current(h.deps, h.projectId).revision.id,
        idempotencyKey: randomUUID(),
        action,
      }),
    ).toMatchObject({ ok: true });
    await settleUntil(h.runner, () => waitingExternalReviews(h.deps.db, h.projectId).length === 2);
    for (const review of waitingExternalReviews(h.deps.db, h.projectId))
      expect(Date.parse(review.deadlineAt)).toBeGreaterThanOrEqual(retried + externalReviewWaitMs);
    expect(settleExternalReviews(h.deps.db, new Date())).toEqual([]);
    expect(
      settleExternalReviews(h.deps.db, new Date(Date.now() + externalReviewWaitMs + 60_000)),
    ).toHaveLength(2);
  });

// A run taken up again after a cancel goes on, so it reads by what it does, not Canceled: here
// its retried images wait for the agent (the header, Projects, Home, the calendar and the MCP
// tools read the stage rows; the runner announces from its own standings).
it("reads a run retried after a cancel by what it does while its images wait for the agent", async () => {
  const { h } = await narratingWhileAgentsReview();
  await cancel(h);
  expect(
    await recoverProject(h.deps, h.projectId, {
      baseRevisionId: current(h.deps, h.projectId).revision.id,
      idempotencyKey: randomUUID(),
      action: { kind: "retry", stage: "images" },
    }),
  ).toMatchObject({ ok: true });
  await settleUntil(h.runner, () => waitingExternalReviews(h.deps.db, h.projectId).length === 2);
  const standings = stageStandingsByProject(h.deps.db, h.projectId).get(h.projectId) ?? [];
  const status = derive(standings);
  expect(status).toBe("pending");
  expect(derive(stagesOf(h.deps.db, h.projectId))).toBe("pending");
  expect(derive(executionStandings(h.deps, h.projectId))).toBe("pending");
  const holds = projectHolds(h.deps.db, { projectId: h.projectId });
  const project = {
    status,
    progress: progressOf(standings),
    ...(holds.waitingForAgent.has(h.projectId) ? { waitingForAgent: true } : {}),
  };
  expect(projectStateWord(project)).toBe("Waiting for the agent");
  expect(runningNow(project)).toBe(true);
  // Both answered, the images finish and nothing else was taken up: the run reads Canceled.
  for (const review of waitingExternalReviews(h.deps.db, h.projectId))
    answerExternalReview(h.deps.db, {
      projectId: h.projectId,
      id: review.id,
      verdict: { passed: true, reasons: [] },
      by: "agent",
      at: new Date().toISOString(),
    });
  h.runner.tick(h.projectId);
  await settleUntil(
    h.runner,
    () =>
      stagesOf(h.deps.db, h.projectId).find((stage) => stage.kind === "images")?.state === "done",
  );
  expect(derive(stagesOf(h.deps.db, h.projectId))).toBe("canceled");
});
