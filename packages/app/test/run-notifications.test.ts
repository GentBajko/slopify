import ffmpegStatic from "ffmpeg-static";
import { expect, it, vi } from "vitest";
import { fakeImage } from "../src/adapters/fake/image.js";
import { fakeLlm } from "../src/adapters/fake/llm.js";
import { fakeTts } from "../src/adapters/fake/tts.js";
import { createHub, observedHub } from "../src/edge/events/hub.js";
import { currentProjectEvent } from "../src/edge/events/visibility.js";
import { createAudioPreviewStore } from "../src/kernel/audio-preview.js";
import { systemClock } from "../src/kernel/clock.js";
import type { Registry } from "../src/kernel/ports/registry.js";
import { wireRunner } from "../src/main.js";
import type { RunConfig } from "../src/slices/admission/model.js";
import { createRunNotifier } from "../src/slices/notifications/notifier.js";
import { noticeSubject } from "../src/slices/notifications/subject.js";
import { narrationCatalogue } from "../src/slices/rebuild/runtime-narration.fake.js";
import { createRebuildDeps, paidServiceFixture } from "../src/slices/rebuild/service.fake.js";
import { waitingExternalReviews } from "../src/slices/reviews/external.js";
import { insertVoice } from "../src/slices/settings/repo.js";
import { resolveFfmpeg } from "../src/slices/video/ffmpeg.js";
import { current, save, start, tone } from "./revision-rebuild.fake.js";

// A real run through the runner, its events handed to the run notifier as boot hands them
// (`main.ts`: the observed hub, and noticeSubject for what a notice says).

async function notifiedRun(options: {
  readonly config: (base: RunConfig) => RunConfig;
  // Before the run starts, once its work is admitted.
  readonly before?: (deps: { readonly projectId: string; readonly revisionId: string }) => void;
}) {
  const h = await paidServiceFixture();
  insertVoice(h.deps.db, { id: "first", name: "first", provider: "openai-tts", voiceId: "first" });
  const registry: Registry = {
    image: () => fakeImage(),
    tts: () => fakeTts({ bytesFor: () => [tone()] }),
    llm: () => fakeLlm(),
    list: async () => [],
  };
  const service = createRebuildDeps({ ...h.deps, clock: systemClock }, h.catalogue);
  service.setCatalogue({
    ...h.catalogue,
    providers: {
      ...h.catalogue.providers,
      ...narrationCatalogue.providers,
      "openai-tts": { maxConcurrent: 1 },
    },
    tts: narrationCatalogue.tts,
  });
  const posted: string[] = [];
  const states: string[] = [];
  const notifier = createRunNotifier({
    url: () => "https://ntfy.example/topic",
    subject: (projectId) => noticeSubject(h.deps.db, projectId),
    send: async (_url, body) => {
      posted.push(body);
      return { ok: true };
    },
    log: { write: () => undefined },
  });
  const hub = observedHub(
    createHub({ ...h.deps, acceptEvent: (event) => currentProjectEvent(h.deps.db, event) }),
    (event) => {
      if (event.type === "project.state") states.push(event.state);
      notifier.observe(event);
    },
  );
  const runner = wireRunner({
    ...service.deps,
    ffmpeg: resolveFfmpeg({}, ffmpegStatic),
    hub,
    registry,
    audioPreviews: createAudioPreviewStore(),
    telemetry: { ...h.deps, appVersion: "test" },
    flusher: { soon: () => undefined, stop: () => undefined },
  });
  const deps = { ...service.deps, runner };
  const base = current(deps, h.projectId);
  await save(deps, h.projectId, {
    config: options.config(base.revision.config),
    content: base.revision.content,
  });
  const keys = Object.keys(current(deps, h.projectId).revision.fingerprints);
  await start({ ...deps, runner: { ...runner, tick: () => undefined } }, h.projectId, keys);
  options.before?.({
    projectId: h.projectId,
    revisionId: current(deps, h.projectId).revision.id,
  });
  runner.tick(h.projectId);
  return { h, deps, runner, notifier, posted, states };
}

async function settleUntil(
  run: Awaited<ReturnType<typeof notifiedRun>>,
  done: () => boolean,
): Promise<void> {
  await vi.waitFor(
    async () => {
      await run.runner.settled();
      expect(done(), "The run never reached the expected state.").toBe(true);
    },
    { timeout: 10_000, interval: 20 },
  );
  await run.notifier.settled();
}

const imagesOnly = (base: RunConfig): RunConfig => ({
  ...base,
  reviews: {
    provider: "",
    model: "",
    reviewer: "agent",
    retries: 0,
    stages: { images: { mode: "flag" } },
  },
});

it("sends no Waiting for you while a run is parked on an agent's review", async () => {
  const run = await notifiedRun({ config: imagesOnly });
  try {
    await settleUntil(run, () => waitingExternalReviews(run.deps.db, run.h.projectId).length === 2);
    // The run stopped to wait, which is when Waiting for you would go out.
    expect(run.states.slice(-2)).toEqual(["running", "pending"]);
    expect(run.posted.filter((body) => body.includes("Waiting for you"))).toEqual([]);
  } finally {
    await run.runner.abortAll();
    run.h.close();
  }
});
