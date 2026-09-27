import { randomUUID } from "node:crypto";
import ffmpegStatic from "ffmpeg-static";
import { expect, it } from "vitest";
import { fakeImage } from "./adapters/fake/image.js";
import { fakeLlm } from "./adapters/fake/llm.js";
import { fakeTts } from "./adapters/fake/tts.js";
import { curateRegistry } from "./catalog/registry.js";
import type { Catalogue } from "./catalog/schema.js";
import type { CatalogueStore } from "./catalog/store.js";
import { createHub } from "./edge/events/hub.js";
import { currentProjectEvent } from "./edge/events/visibility.js";
import { createApp } from "./edge/http/app.js";
import { createAudioPreviewStore } from "./kernel/audio-preview.js";
import { systemClock } from "./kernel/clock.js";
import type { LlmCompletion, LlmEvent } from "./kernel/ports/llm.js";
import { wireRunner } from "./main.js";
import { insertPrompt } from "./slices/library/repo.js";
import { currentRevisionId } from "./slices/revisions/repo.js";
import { revisionFixture } from "./slices/revisions/revision.fake.js";
import { providers as providerCatalog } from "./slices/settings/model.js";
import { resolveFfmpeg } from "./slices/video/ffmpeg.js";

it("rewords a refused image prompt with the project's model and draws it again", async () => {
  const h = revisionFixture();
  const deps = { ...h.deps, clock: systemClock };
  const model = {
    name: "Test",
    enabled: true,
    deprecated: false,
    keywords: [],
    source: "https://example.test",
    pricing: {},
  };
  const value: Catalogue = {
    schemaVersion: 1,
    updatedAt: "2026-09-12",
    providers: { openrouter: { maxConcurrent: 5 }, fal: { maxConcurrent: 5 } },
    llm: [{ ...model, provider: "openrouter", id: "llm", llm: { webSearch: false } }],
    tts: [],
    image: [{ ...model, provider: "fal", id: "image", image: { aspectRatios: ["16:9", "9:16"] } }],
  };
  const catalogue: CatalogueStore = {
    read: () => value,
    models: (provider, family) => value[family].filter((row) => row.provider === provider),
    refresh: async () => {},
    status: () => ({ updatedAt: "2026-09-12", path: "unused", warning: null, source: "test" }),
  };
  const asked: LlmCompletion[] = [];
  const llm = {
    ...fakeLlm(),
    complete: async function* (request: LlmCompletion): AsyncGenerator<LlmEvent> {
      asked.push(request);
      yield { type: "delta", text: '"A calm dragon over a quiet sea."' };
      yield { type: "done", usage: null, finishReason: "stop" };
    },
  };
  const images = fakeImage({
    failOnAttempt: { 1: { kind: "refusal", message: "fal.ai refused to make this image" } },
  });
  const registry = curateRegistry(
    { llm: () => llm, tts: () => fakeTts(), image: () => images, list: async () => [] },
    catalogue,
  );
  const hub = createHub({
    ids: deps.ids,
    log: deps.log,
    acceptEvent: (event) => currentProjectEvent(deps.db, event),
  });
  const runner = wireRunner({
    ...deps,
    ffmpeg: resolveFfmpeg({}, ffmpegStatic),
    catalogue,
    hub,
    audioPreviews: createAudioPreviewStore(),
    telemetry: { ...deps, appVersion: "test" },
    flusher: { soon: () => {}, stop: () => {} },
    registry,
  });
  try {
    // Placeholders: the fakes never read them, readiness only asks that one is saved.
    for (const provider of ["openrouter", "fal"])
      deps.db
        .prepare(
          "INSERT INTO provider_keys (provider,key,updated_at) VALUES (?, 'placeholder', '2026-09-12')",
        )
        .run(provider);
    insertPrompt(deps.db, {
      id: "image",
      kind: "image",
      name: "image",
      body: "A dragon tearing a ship apart.",
      slots: [],
      updatedAt: "2026-09-12",
    });
    const app = createApp({
      ...deps,
      rebuild: {
        ...deps,
        runner,
        catalogue,
        emit: (projectId, event) => hub.emit(projectId, event),
        providers: async () =>
          providerCatalog.map((one) => ({
            id: one.id,
            family: one.family,
            displayName: one.displayName,
            readiness: { kind: "keyed" as const, hasKey: true },
          })),
        modelsFor: async (provider, family) =>
          value[family]
            .filter((row) => row.provider === provider)
            .map((row) => ({ id: row.id, name: row.name })),
      },
      catalogue,
      hub,
      runner,
      version: "test",
      webDist: "/unused",
      probe: async () => ({ ran: false, stdout: "" }),
      flushSoon: () => {},
    });
    await app.request("/api/telemetry/notice", { method: "POST" });
    const created = await app.request("/api/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...h.config,
        sources: { ...h.config.sources, images: "generate" },
        imagePrompts: [{ name: "image", number: 1 }],
        llm: { provider: "openrouter", model: "llm" },
        images: { provider: "fal", model: "image" },
      }),
    });
    expect(created.status, await created.clone().text()).toBe(201);
    const { project } = (await created.json()) as { project: { id: string } };
    await expect.poll(() => images.calls()).toBe(1);
    await runner.settled();
    const failed = (await (await app.request(`/api/projects/${project.id}`)).json()) as {
      project: { status: string };
      stages: { kind: string; failureKind?: string }[];
    };
    expect(failed.project.status).toBe("failed");
    expect(failed.stages.find((stage) => stage.kind === "images")?.failureKind).toBe("refusal");

    const soften = await app.request(`/api/projects/${project.id}/stages/images/soften`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        baseRevisionId: currentRevisionId(deps.db, project.id),
        idempotencyKey: randomUUID(),
      }),
    });
    expect(soften.status, await soften.clone().text()).toBe(202);
    await expect.poll(() => images.calls()).toBe(2);
    await runner.settled();

    expect(asked).toHaveLength(1);
    expect(asked[0]?.messages[0]?.content).toContain("A dragon tearing a ship apart.");
    expect(images.seen()[1]?.prompt).toBe("A calm dragon over a quiet sea.");
    expect(deps.db.prepare("SELECT count(*) AS n FROM prompt_softening").get()).toEqual({ n: 0 });
    const done = (await (await app.request(`/api/projects/${project.id}`)).json()) as {
      project: { status: string };
    };
    expect(done.project.status).toBe("done");
    // Nothing was refused any more, so there is nothing left to soften.
    const again = await app.request(`/api/projects/${project.id}/stages/images/soften`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        baseRevisionId: currentRevisionId(deps.db, project.id),
        idempotencyKey: randomUUID(),
      }),
    });
    expect(again.status).toBe(409);
  } finally {
    await runner.abortAll();
    h.close();
  }
});
