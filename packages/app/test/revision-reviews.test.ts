import { existsSync } from "node:fs";
import ffmpegStatic from "ffmpeg-static";
import { expect, it } from "vitest";
import { fakeImage } from "../src/adapters/fake/image.js";
import { fakeLlm } from "../src/adapters/fake/llm.js";
import { fakeTts } from "../src/adapters/fake/tts.js";
import { createHub, observedHub } from "../src/edge/events/hub.js";
import { currentProjectEvent } from "../src/edge/events/visibility.js";
import { createAudioPreviewStore } from "../src/kernel/audio-preview.js";
import { systemClock } from "../src/kernel/clock.js";
import type { ReviewFlaggedEvent } from "../src/kernel/events.js";
import type { LlmCompletion } from "../src/kernel/ports/llm.js";
import type { Registry } from "../src/kernel/ports/registry.js";
import { wireRunner } from "../src/main.js";
import { createReviewRedos } from "../src/slices/rebuild/review-redo.js";
import { createRebuildDeps, paidServiceFixture } from "../src/slices/rebuild/service.fake.js";
import type { ReviewMode } from "../src/slices/reviews/model.js";
import { actOnVerdict, listVerdicts, pendingRedos } from "../src/slices/reviews/repo.js";
import { resolveFfmpeg } from "../src/slices/video/ffmpeg.js";
import { current, save, start, tone } from "./revision-rebuild.fake.js";

// Two generated images reviewed by a CLI reviewer (a scripted double: no CLI is run). The
// reviewer always fails image "one" and passes image "two".
const fails = (request: LlmCompletion): boolean =>
  (request.messages.at(-1)?.content ?? "").includes('"""\nOne\n"""');

async function reviewedRun(mode: Exclude<ReviewMode, "off">) {
  const h = await paidServiceFixture();
  const shown: string[] = [];
  const reviewer = fakeLlm({
    reply: (request) => [
      ...(request.images ?? []).map((image) => {
        shown.push(image.path);
        return "";
      }),
      fails(request)
        ? '{"verdict":"fail","reasons":["Stray letters across the sky."]}'
        : '{"verdict":"pass","reasons":[]}',
    ],
  });
  const images = fakeImage();
  const registry: Registry = {
    image: () => images,
    tts: () => fakeTts({ bytesFor: () => [tone()] }),
    llm: () => reviewer,
    list: async () => [],
  };
  const service = createRebuildDeps({ ...h.deps, clock: systemClock }, h.catalogue);
  service.setCatalogue({
    ...h.catalogue,
    llm: [
      {
        provider: "codex",
        id: "gpt",
        name: "GPT",
        enabled: true,
        deprecated: false,
        source: "https://example.test",
        keywords: [],
        pricing: {},
        llm: { webSearch: false },
      },
    ],
  });
  const redos = createReviewRedos();
  const flaggedEvents: ReviewFlaggedEvent[] = [];
  const runner = wireRunner({
    ...service.deps,
    ffmpeg: resolveFfmpeg({}, ffmpegStatic),
    hub: observedHub(
      createHub({ ...h.deps, acceptEvent: (event) => currentProjectEvent(h.deps.db, event) }),
      (event) => {
        if (event.type === "review.flagged") flaggedEvents.push(event);
      },
    ),
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
      reviews: { provider: "codex", model: "gpt", retries: 1, stages: { images: { mode } } },
    },
    content: base.revision.content,
  });
  await start(deps, h.projectId, Object.keys(current(deps, h.projectId).revision.fingerprints));
  // A redo starts after its review's step has finished, so the run settles in rounds.
  for (let round = 0; round < 20; round++) {
    await runner.settled();
    await new Promise((resolve) => setTimeout(resolve, 20));
    if (pendingRedos(deps.db, h.projectId).length === 0 && !runner.hasInflight?.(h.projectId))
      break;
  }
  await runner.settled();
  const verdicts = listVerdicts(deps.db, h.projectId).toReversed();
  return { h, deps, reviewer, images, verdicts, shown, flaggedEvents };
}

it("sends a failed image back once, then keeps it and flags it; the passed one is left alone", async () => {
  const { h, deps, reviewer, images, verdicts, shown, flaggedEvents } = await reviewedRun("redo");
  const one = verdicts.filter((row) => row.itemKey === "image:one");
  expect(one.map((row) => [row.attempt, row.outcome, row.redoState])).toEqual([
    [1, "redo", "started"],
    [2, "flagged", null],
  ]);
  expect(one[1]?.reasons).toEqual(["Stray letters across the sky."]);
  // Only the kept-and-flagged verdict asks for a decision; the redo did not.
  expect(flaggedEvents).toMatchObject([
    {
      type: "review.flagged",
      projectId: h.projectId,
      verdictId: one[1]?.id,
      stage: "images",
      itemKey: "image:one",
      reason: "Stray letters across the sky.",
    },
  ]);
  expect(verdicts.filter((row) => row.itemKey === "image:two").map((row) => row.outcome)).toEqual([
    "passed",
  ]);
  // Two images, one remake; two reviews, one more of the remake. Never a loop.
  expect(images.calls()).toBe(3);
  expect(reviewer.calls()).toBe(3);
  // The reviewer was shown each image file itself.
  expect(shown).toHaveLength(3);
  expect(shown.every((path) => existsSync(path))).toBe(true);
  const view = current(deps, h.projectId);
  const selected = view.outputs.filter((row) => row.selected && row.workKey === "image:one");
  expect(selected).toHaveLength(1);
  // The remake came through the regeneration token, like Regenerate: a new project version.
  expect(view.revision.content.regenerationTokens).toHaveProperty("image:one");
  // Overrule accepts the flagged image as it is.
  const flagged = one[1];
  if (flagged === undefined) throw new Error("no flagged verdict");
  expect(actOnVerdict(deps.db, h.projectId, flagged.id, "overruled", "now")).toMatchObject({
    ok: true,
    value: { action: "overruled" },
  });
});

it("only flags a failed image in Flag only, and makes nothing again", async () => {
  const { images, reviewer, verdicts } = await reviewedRun("flag");
  expect(verdicts.map((row) => [row.itemKey, row.outcome, row.redoState]).sort()).toEqual([
    ["image:one", "flagged", null],
    ["image:two", "passed", null],
  ]);
  expect(images.calls()).toBe(2);
  expect(reviewer.calls()).toBe(2);
});
