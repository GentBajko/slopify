import ffmpegStatic from "ffmpeg-static";
import { expect, it } from "vitest";
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
import { createRebuildDeps, paidServiceFixture } from "../src/slices/rebuild/service.fake.js";
import { answerExternalReview, waitingExternalReviews } from "../src/slices/reviews/external.js";
import { listVerdicts } from "../src/slices/reviews/repo.js";
import { resolveFfmpeg } from "../src/slices/video/ffmpeg.js";
import { current, save, start, tone } from "./revision-rebuild.fake.js";

async function settleUntil(runner: Runner, done: () => boolean): Promise<void> {
  for (let round = 0; round < 50; round++) {
    await runner.settled();
    await new Promise((resolve) => setTimeout(resolve, 20));
    if (done()) return;
  }
  throw new Error("The run never reached the expected state.");
}

// Two generated images reviewed by an external agent: no model is asked.
async function agentReviewedRun() {
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
  const runner = wireRunner({
    ...service.deps,
    ffmpeg: resolveFfmpeg({}, ffmpegStatic),
    hub: createHub({ ...h.deps, acceptEvent: (event) => currentProjectEvent(h.deps.db, event) }),
    registry,
    audioPreviews: createAudioPreviewStore(),
    telemetry: { ...h.deps, appVersion: "test" },
    flusher: { soon: () => undefined, stop: () => undefined },
  });
  const deps = { ...service.deps, runner };
  const base = current(deps, h.projectId);
  await save(deps, h.projectId, {
    config: {
      ...base.revision.config,
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
