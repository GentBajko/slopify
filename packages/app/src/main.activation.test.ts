import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { fakeLlm } from "./adapters/fake/llm.js";
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
import { saveRevision } from "./slices/revisions/mutations.js";
import { currentRevisionId } from "./slices/revisions/repo.js";
import { revisionFixture } from "./slices/revisions/revision.fake.js";
import { getRevisionView } from "./slices/revisions/view.js";
import { outputPath } from "./slices/storage/layout.js";

it("runs HTTP Start through the production runner and attaches unchanged accepted work after title Save", async () => {
  const h = revisionFixture();
  const logs: unknown[] = [];
  const deps = {
    ...h.deps,
    clock: systemClock,
    log: {
      write: (...args: unknown[]) => {
        logs.push(args);
      },
    },
  };
  let release = () => {};
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const seen: LlmCompletion[] = [];
  const llm = {
    ...fakeLlm(),
    complete: async function* (request: LlmCompletion): AsyncGenerator<LlmEvent> {
      seen.push(request);
      yield { type: "delta", text: "A retained " };
      await pending;
      request.signal.throwIfAborted();
      yield { type: "delta", text: "article." };
      yield { type: "done", usage: { inputTokens: 1, outputTokens: 2 }, finishReason: "stop" };
    },
  };
  const catalogueValue: Catalogue = {
    schemaVersion: 1,
    updatedAt: "2026-09-12",
    providers: { openrouter: { maxConcurrent: 5 } },
    llm: [
      {
        provider: "openrouter",
        id: "test",
        name: "Test",
        enabled: true,
        deprecated: false,
        keywords: [],
        source: "https://example.test",
        pricing: {},
        llm: { webSearch: true, thinking: { high: { effort: "high" } } },
      },
    ],
    tts: [],
    image: [],
  };
  const catalogue: CatalogueStore = {
    read: () => catalogueValue,
    models: () => catalogueValue.llm,
    refresh: async () => {},
    status: () => ({ updatedAt: "2026-09-12", path: "unused", warning: null, source: "test" }),
  };
  const hub = createHub({
    ids: deps.ids,
    log: deps.log,
    acceptEvent: (event) => currentProjectEvent(deps.db, event),
  });
  const runner = wireRunner({
    ...deps,
    ffmpeg: "unused",
    catalogue,
    hub,
    audioPreviews: createAudioPreviewStore(),
    telemetry: { ...deps, appVersion: "test" },
    flusher: { soon: () => {}, stop: () => {} },
    registry: {
      llm: () => llm,
      tts: () => {
        throw new Error("No TTS");
      },
      image: () => {
        throw new Error("No images");
      },
      list: async () => [],
    },
  });
  try {
    insertPrompt(deps.db, {
      id: "prompt",
      kind: "article",
      name: "Article",
      body: "Write about {{topic}}.",
      slots: ["topic"],
      updatedAt: "2026-09-12",
    });
    const app = createApp({
      ...deps,
      catalogue,
      hub,
      runner,
      version: "test",
      webDist: "/unused",
      probe: async () => ({ ran: false, stdout: "" }),
      flushSoon: () => {},
    });
    const response = await app.request("/api/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...h.config,
        title: "Initial",
        sources: { ...h.config.sources, article: "generate" },
        articlePrompt: "Article",
        llm: { provider: "openrouter", model: "test", thinking: "high" },
        values: { topic: "rope" },
        provided: {},
      }),
    });
    expect(response.status, JSON.stringify(logs) + (await response.clone().text())).toBe(201);
    const body = (await response.json()) as { project: { id: string } };
    const id = body.project.id;
    await expect.poll(() => seen.length).toBe(1);
    const origin = currentRevisionId(deps.db, id);
    if (origin === undefined) throw new Error("Start did not adopt a revision");
    const base = getRevisionView(deps, id, origin);
    if (base === undefined) throw new Error("Missing baseline");
    const saved = await saveRevision(deps, {
      projectId: id,
      baseRevisionId: origin,
      idempotencyKey: "rename",
      edit: {
        config: { ...base.revision.config, title: "Renamed" },
        content: base.revision.content,
      },
    });
    if (!saved.ok) throw new Error(JSON.stringify(saved));
    release();
    await runner.settled();
    const current = getRevisionView(deps, id, saved.view.revision.id);
    const article = current?.outputs.find(
      (output) => output.selected && output.output.role === "article_md",
    );
    expect(article).toBeDefined();
    if (article === undefined) throw new Error("Missing article");
    expect(article.output.path).toContain("assets/");
    expect(readFileSync(outputPath(deps.paths, id, article.output.path), "utf8")).toBe(
      "A retained article.",
    );
    expect(seen).toHaveLength(1);
    expect(seen[0]?.thinkingConfig).toEqual({ effort: "high" });
    expect(deps.db.prepare("SELECT revision_id,work_piece_id,outcome FROM attempts").all()).toEqual(
      [
        expect.objectContaining({
          revision_id: origin,
          work_piece_id: expect.any(String),
          outcome: "ok",
        }),
      ],
    );
    const finished = await app.request(`/api/projects/${id}`);
    expect(await finished.json()).toMatchObject({
      revisionId: saved.view.revision.id,
      project: { title: "Renamed", status: "done" },
    });
  } finally {
    release();
    await runner.settled();
    h.close();
  }
});
