import { randomUUID } from "node:crypto";
import ffmpegStatic from "ffmpeg-static";
import { expect, it, vi } from "vitest";
import { fakeImage } from "../src/adapters/fake/image.js";
import { fakeLlm } from "../src/adapters/fake/llm.js";
import { fakeTts } from "../src/adapters/fake/tts.js";
import { createHub } from "../src/edge/events/hub.js";
import { currentProjectEvent } from "../src/edge/events/visibility.js";
import { createAudioPreviewStore } from "../src/kernel/audio-preview.js";
import { systemClock } from "../src/kernel/clock.js";
import type { Registry } from "../src/kernel/ports/registry.js";
import type { Runner } from "../src/kernel/runner/index.js";
import { wireRunner } from "../src/main.js";
import { setProjectPaused } from "../src/slices/admission/repo.js";
import { recoverCheckpointWork } from "../src/slices/checkpoints/recovery.js";
import { recoverProject } from "../src/slices/rebuild/recovery.js";
import { createReviewRedos } from "../src/slices/rebuild/review-redo.js";
import { createRebuildDeps, paidServiceFixture } from "../src/slices/rebuild/service.fake.js";
import { externalReviewWaitMs } from "../src/slices/reviews/external-model.js";
import { releaseDueReviews } from "../src/slices/reviews/external-release.js";
import {
  answerExternalReview,
  settleExternalReviews,
  waitingExternalReviews,
} from "../src/slices/reviews/external-repo.js";
import { listVerdicts } from "../src/slices/reviews/repo.js";
import { resolveFfmpeg } from "../src/slices/video/ffmpeg.js";
import { current, save, start, tone } from "./revision-rebuild.fake.js";

async function settleUntil(runner: Runner, done: () => boolean): Promise<void> {
  await vi.waitFor(
    async () => {
      await runner.settled();
      expect(done(), "The run never reached the expected state.").toBe(true);
    },
    { timeout: 4_000, interval: 20 },
  );
}

// Two generated images reviewed by an external agent: no model is asked.
async function agentReviewedRun(mode: "flag" | "redo" = "flag") {
  const h = await paidServiceFixture();
  const reviewer = fakeLlm({ reply: () => ['{"verdict":"pass","reasons":[]}'] });
  const images = fakeImage();
  const registry: Registry = {
    image: () => images,
    tts: () => fakeTts({ bytesFor: () => [tone()] }),
    llm: () => reviewer,
    list: async () => [],
  };
  const service = createRebuildDeps({ ...h.deps, clock: systemClock }, h.catalogue);
  // As boot wires them (`main.ts`): a verdict that sends its item back starts its redo.
  const redos = createReviewRedos();
  const runner = wireRunner({
    ...service.deps,
    ffmpeg: resolveFfmpeg({}, ffmpegStatic),
    hub: createHub({ ...h.deps, acceptEvent: (event) => currentProjectEvent(h.deps.db, event) }),
    registry,
    audioPreviews: createAudioPreviewStore(),
    telemetry: { ...h.deps, appVersion: "test" },
    flusher: { soon: () => undefined, stop: () => undefined },
    onFinished: (work) => redos.kick(work.projectId),
  });
  const deps = { ...service.deps, runner };
  redos.bind(deps);
  const base = current(deps, h.projectId);
  await save(deps, h.projectId, {
    config: {
      ...base.revision.config,
      reviews: {
        provider: "",
        model: "",
        reviewer: "agent",
        retries: 1,
        stages: { images: { mode } },
      },
    },
    content: base.revision.content,
  });
  await start(deps, h.projectId, Object.keys(current(deps, h.projectId).revision.fingerprints));
  await settleUntil(runner, () => waitingExternalReviews(deps.db, h.projectId).length === 2);
  return { h, deps, runner, reviewer, images };
}

it("waits for an agent on every image without asking a model, then keeps its verdicts", async () => {
  const { h, deps, runner, reviewer, images } = await agentReviewedRun();
  expect(reviewer.calls()).toBe(0);
  expect(images.calls()).toBe(2);
  expect(listVerdicts(deps.db, h.projectId)).toEqual([]);
  const waiting = waitingExternalReviews(deps.db, h.projectId);
  expect(waiting.every((row) => row.material.images.length > 0)).toBe(true);
  const [one, two] = waiting;
  if (one === undefined || two === undefined) throw new Error("two reviews expected");
  const at = new Date().toISOString();
  answerExternalReview(deps.db, {
    projectId: h.projectId,
    id: one.id,
    verdict: { passed: false, reasons: ["Stray letters in the sky."] },
    by: "agent",
    at,
  });
  answerExternalReview(deps.db, {
    projectId: h.projectId,
    id: two.id,
    verdict: { passed: true, reasons: [] },
    by: "agent",
    at,
  });
  runner.tick(h.projectId);
  await settleUntil(runner, () => listVerdicts(deps.db, h.projectId).length === 2);
  expect(
    listVerdicts(deps.db, h.projectId)
      .map((row) => [row.itemKey, row.outcome, row.answeredBy])
      .sort(),
  ).toEqual(
    [
      [one.itemKey, "flagged", "agent"],
      [two.itemKey, "passed", "agent"],
    ].sort(),
  );
  expect(reviewer.calls()).toBe(0);
});

it("passes both images without review after two hours with no agent, and the run goes on", async () => {
  const { h, deps, runner, reviewer } = await agentReviewedRun();
  expect(
    settleExternalReviews(deps.db, new Date(Date.now() + externalReviewWaitMs + 60_000)),
  ).toHaveLength(2);
  runner.tick(h.projectId);
  await settleUntil(runner, () => listVerdicts(deps.db, h.projectId).length === 2);
  expect(
    listVerdicts(deps.db, h.projectId).map((row) => [row.outcome, row.passed, row.answeredBy]),
  ).toEqual([
    ["auto-passed", true, "nobody"],
    ["auto-passed", true, "nobody"],
  ]);
  expect(reviewer.calls()).toBe(0);
});

it("lets the run go on after a restart once the waiting reviews are answered", async () => {
  const { h, deps, runner } = await agentReviewedRun();
  await runner.settled();
  // What boot does before anything runs (`main.ts`).
  recoverCheckpointWork(deps.db);
  const at = new Date().toISOString();
  for (const review of waitingExternalReviews(deps.db, h.projectId))
    answerExternalReview(deps.db, {
      projectId: h.projectId,
      id: review.id,
      verdict: { passed: true, reasons: [] },
      by: "agent",
      at,
    });
  runner.tick(h.projectId);
  await settleUntil(runner, () => listVerdicts(deps.db, h.projectId).length === 2);
  expect(listVerdicts(deps.db, h.projectId).map((row) => row.outcome)).toEqual([
    "passed",
    "passed",
  ]);
});

it("passes reviews a restart left overdue at boot, and the run goes on", async () => {
  const { h, deps, runner } = await agentReviewedRun();
  await runner.settled();
  recoverCheckpointWork(deps.db);
  const emitted: string[] = [];
  // What boot runs next (`main.ts` releaseReviews), two hours and a minute later.
  const passed = releaseDueReviews({
    db: deps.db,
    now: () => new Date(Date.now() + externalReviewWaitMs + 60_000),
    emit: (_projectId, event) => {
      emitted.push(event.type);
    },
    tick: runner.tick,
    log: { write: () => undefined },
  });
  expect(passed).toBe(2);
  expect(emitted.filter((type) => type === "review.auto-passed")).toHaveLength(2);
  await settleUntil(runner, () => listVerdicts(deps.db, h.projectId).length === 2);
  expect(listVerdicts(deps.db, h.projectId).map((row) => row.outcome)).toEqual([
    "auto-passed",
    "auto-passed",
  ]);
});

it("passes a paused project's reviews at the deadline, but nothing runs until Resume", async () => {
  const { h, deps, runner } = await agentReviewedRun();
  await runner.settled();
  setProjectPaused(deps.db, h.projectId, true, new Date().toISOString());
  expect(
    settleExternalReviews(deps.db, new Date(Date.now() + externalReviewWaitMs + 60_000)),
  ).toHaveLength(2);
  // The runner claims nothing for a paused project: once it has settled, nothing ran.
  runner.tick(h.projectId);
  await runner.settled();
  expect(runner.hasInflight?.(h.projectId) ?? false).toBe(false);
  expect(listVerdicts(deps.db, h.projectId)).toEqual([]);
  // resume_project's route (`POST /api/projects/:id/resume`).
  expect(
    await recoverProject(deps, h.projectId, {
      baseRevisionId: current(deps, h.projectId).revision.id,
      idempotencyKey: randomUUID(),
      action: { kind: "resume" },
    }),
  ).toMatchObject({ ok: true });
  await settleUntil(runner, () => listVerdicts(deps.db, h.projectId).length === 2);
  expect(listVerdicts(deps.db, h.projectId).map((row) => row.outcome)).toEqual([
    "auto-passed",
    "auto-passed",
  ]);
});

it("makes an image an agent failed again in redo mode, asks the agent again, then flags it", async () => {
  const { h, deps, runner, reviewer, images } = await agentReviewedRun("redo");
  const [first, second] = waitingExternalReviews(deps.db, h.projectId);
  if (first === undefined || second === undefined) throw new Error("two reviews expected");
  const fail = (id: string) =>
    answerExternalReview(deps.db, {
      projectId: h.projectId,
      id,
      verdict: { passed: false, reasons: ["Stray letters in the sky."] },
      by: "agent",
      at: new Date().toISOString(),
    });
  fail(first.id);
  // The redo starts once the stage's reviews are all answered.
  answerExternalReview(deps.db, {
    projectId: h.projectId,
    id: second.id,
    verdict: { passed: true, reasons: [] },
    by: "agent",
    at: new Date().toISOString(),
  });
  runner.tick(h.projectId);
  // The image is drawn again, and its new review waits for the agent.
  await settleUntil(runner, () =>
    waitingExternalReviews(deps.db, h.projectId).some(
      (row) => row.itemKey === first.itemKey && row.id !== first.id,
    ),
  );
  expect(images.calls()).toBe(3);
  expect(
    listVerdicts(deps.db, h.projectId).find((row) => row.itemKey === first.itemKey),
  ).toMatchObject({
    outcome: "redo",
    answeredBy: "agent",
    redoState: "started",
  });
  const again = waitingExternalReviews(deps.db, h.projectId).find(
    (row) => row.itemKey === first.itemKey,
  );
  if (again === undefined) throw new Error("a new review of the remade image expected");
  expect(again.itemFingerprint).not.toBe(first.itemFingerprint);
  // Past its one retry, the second fail is kept and flagged.
  fail(again.id);
  runner.tick(h.projectId);
  await settleUntil(runner, () =>
    listVerdicts(deps.db, h.projectId).some(
      (row) => row.itemKey === first.itemKey && row.outcome === "flagged",
    ),
  );
  expect(
    listVerdicts(deps.db, h.projectId)
      .filter((row) => row.itemKey === first.itemKey)
      .map((row) => [row.outcome, row.attempt, row.answeredBy]),
  ).toEqual(
    expect.arrayContaining([
      ["redo", 1, "agent"],
      ["flagged", 2, "agent"],
    ]),
  );
  expect(images.calls()).toBe(3);
  expect(reviewer.calls()).toBe(0);
});
