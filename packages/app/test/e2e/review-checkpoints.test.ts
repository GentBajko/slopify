import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { fakeImage } from "../../src/adapters/fake/image.js";
import { fakeTts } from "../../src/adapters/fake/tts.js";
import { setProjectPaused } from "../../src/slices/admission/repo.js";
import { cancelProject } from "../../src/slices/cancel/index.js";
import { restoreRevision } from "../../src/slices/revisions/mutations.js";
import { current, deferred, save, tone } from "../revision-rebuild.fake.js";
import { checkpointFixture } from "./review-checkpoints.http.js";

it("holds all three gates, releases Images independently, and refuses removal after submission", async () => {
  const images = fakeImage();
  const audio = fakeTts({ bytesFor: () => [tone()] });
  const entered = deferred<void>();
  const finish = deferred<void>();
  const h = await checkpointFixture({
    tts: () => audio,
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
    const base = current(h.deps, h.projectId);
    await save(h.deps, h.projectId, {
      config: {
        ...base.revision.config,
        sources: { ...base.revision.config.sources, audio: "generate" },
        audio: { provider: "openai-tts", model: "tts", voice: "first" },
        chunking: { mode: "paragraph" },
      },
      content: base.revision.content,
    });
    await h.admit(["image:one", "image:two", "export:wav"]);
    expect((await h.change(["audio", "images", "video"])).status).toBe(200);
    h.runner.tick(h.projectId);
    await h.runner.settled();
    expect(images.calls()).toBe(0);
    expect(audio.calls()).toBe(0);
    const gates = (await h.status()).checkpoints;
    expect(gates.map((gate) => gate.stage).sort()).toEqual(["audio", "images", "video"]);
    const image = gates.find((gate) => gate.stage === "images");
    if (!image) throw new Error("Missing Images checkpoint");
    const key = randomUUID();
    expect((await h.approve(image, key)).status).toBe(200);
    await entered.promise;
    const replay = await h.approve(image, key);
    expect(replay.status).toBe(200);
    expect(await replay.json()).toMatchObject({ replayed: true });
    expect((await h.change(["audio", "video"])).status).toBe(409);
    finish.resolve();
    await h.runner.settled();
    expect(images.calls()).toBe(2);
    expect(audio.calls()).toBe(0);
    expect(
      current(h.deps, h.projectId).outputs.some((row) => row.output.role === "audio_export"),
    ).toBe(false);
    const narration = (await h.status()).checkpoints.find((gate) => gate.stage === "audio");
    if (!narration) throw new Error("Missing Audio checkpoint");
    expect((await h.approve(narration)).status).toBe(200);
    await h.runner.settled();
    expect(audio.calls()).toBeGreaterThan(0);
    const exportGate = (await h.status()).checkpoints.find((gate) => gate.stage === "video");
    if (!exportGate) throw new Error("Missing export checkpoint");
    expect((await h.approve(exportGate)).status).toBe(200);
    await h.runner.settled();
    const final = {
      exported: current(h.deps, h.projectId).outputs.some(
        (row) => row.output.role === "audio_export" && row.available,
      ),
      gates: (await h.status()).checkpoints,
      work: h.deps.db.prepare("SELECT kind,state,failure_reason FROM revision_work").all(),
    };
    expect(final.exported, JSON.stringify(final)).toBe(true);
  } finally {
    finish.resolve();
    await h.dispose();
  }
}, 60000);

it("runs unchanged zero-gate projects and saves gate changes without provider submissions", async () => {
  const images = fakeImage();
  const h = await checkpointFixture({ image: () => images });
  try {
    await h.admit();
    expect((await h.status()).checkpoints).toEqual([]);
    expect((await h.change(["images"])).status).toBe(200);
    expect(images.calls()).toBe(0);
    expect((await h.change([])).status).toBe(200);
    await h.runner.settled();
    expect(images.calls()).toBe(2);
    expect((await h.status()).checkpoints).toEqual([]);
  } finally {
    await h.dispose();
  }
});

it("restores a revision without dropping the current review gate", async () => {
  const images = fakeImage();
  const h = await checkpointFixture({ image: () => images });
  try {
    await h.admit();
    expect((await h.change(["images"])).status).toBe(200);
    const base = current(h.deps, h.projectId);
    const next = await save(h.deps, h.projectId, {
      config: { ...base.revision.config, title: "Renamed" },
      content: base.revision.content,
    });
    const restored = await restoreRevision(h.deps, {
      projectId: h.projectId,
      baseRevisionId: next.revision.id,
      targetRevisionId: base.revision.id,
      idempotencyKey: randomUUID(),
    });
    expect(restored.ok).toBe(true);
    expect((await h.status()).checkpoints).toMatchObject([{ stage: "images", state: "held" }]);
    h.runner.tick(h.projectId);
    await h.runner.settled();
    expect(images.calls()).toBe(0);
  } finally {
    await h.dispose();
  }
});

it("does not resurrect approval when Restore changes the reviewed inputs", async () => {
  const images = fakeImage();
  const h = await checkpointFixture({ image: () => images });
  try {
    await h.admit();
    expect((await h.change(["images"])).status).toBe(200);
    const base = current(h.deps, h.projectId);
    const gate = (await h.status()).checkpoints[0];
    if (!gate) throw new Error("Missing gate");
    setProjectPaused(h.deps.db, h.projectId, true, h.deps.clock.now().toISOString());
    expect((await h.approve(gate)).status).toBe(200);
    await h.runner.settled();
    const changed = await save(h.deps, h.projectId, {
      config: base.revision.config,
      content: {
        ...base.revision.content,
        imageDefinitions: {
          ...base.revision.content.imageDefinitions,
          one: { source: "generate", prompt: "Changed image", assetId: null },
        },
      },
    });
    expect((await h.status()).checkpoints).toMatchObject([{ state: "held", approvedAt: null }]);
    expect(
      (
        await restoreRevision(h.deps, {
          projectId: h.projectId,
          baseRevisionId: changed.revision.id,
          targetRevisionId: base.revision.id,
          idempotencyKey: randomUUID(),
        })
      ).ok,
    ).toBe(true);
    expect((await h.status()).checkpoints).toMatchObject([{ state: "held", approvedAt: null }]);
    expect((await h.approve(gate)).status).toBe(409);
    expect(images.calls()).toBe(0);
  } finally {
    await h.dispose();
  }
});

it("cancels a held checkpoint durably and refuses approval without leaking private inputs", async () => {
  const images = fakeImage();
  const h = await checkpointFixture({ image: () => images });
  try {
    await h.admit();
    expect((await h.change(["images"])).status).toBe(200);
    const gate = (await h.status()).checkpoints[0];
    if (!gate) throw new Error("Missing held gate");
    const canceled = await cancelProject(
      {
        ...h.deps,
        abort: h.runner.abortProject,
        emit: () => undefined,
      },
      h.projectId,
      { baseRevisionId: gate.revisionId, idempotencyKey: randomUUID() },
    );
    expect(canceled.ok).toBe(true);
    expect((await h.status()).checkpoints).toMatchObject([{ state: "canceled", approvedAt: null }]);
    const refused = await h.approve(gate);
    expect(refused.status).toBe(409);
    expect(refused.headers.get("content-type")).toContain("application/problem+json");
    expect(await refused.text()).not.toContain(gate.fingerprint);
    h.runner.tick(h.projectId);
    await h.runner.settled();
    expect(images.calls()).toBe(0);
  } finally {
    await h.dispose();
  }
});
