import { readFileSync } from "node:fs";
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
import { insertEntry, insertPrompt } from "./slices/library/repo.js";
import { saveRevision } from "./slices/revisions/mutations.js";
import { currentRevisionId } from "./slices/revisions/repo.js";
import { revisionFixture } from "./slices/revisions/revision.fake.js";
import { getRevisionView } from "./slices/revisions/view.js";
import { outputPath } from "./slices/storage/layout.js";
import { resolveFfmpeg } from "./slices/video/ffmpeg.js";

function tone(): Uint8Array {
  const bytes = Buffer.alloc(44 + 1600);
  bytes.write("RIFF");
  bytes.writeUInt32LE(bytes.length - 8, 4);
  bytes.write("WAVEfmt ", 8);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(8000, 24);
  bytes.writeUInt32LE(16000, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write("data", 36);
  bytes.writeUInt32LE(1600, 40);
  return bytes;
}

it("materializes research and physical narration under the initial snapshot while independent images run", async () => {
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
  const baseModel = {
    name: "Test",
    enabled: true,
    deprecated: false,
    keywords: [],
    source: "https://example.test",
    pricing: {},
  };
  let value: Catalogue = {
    schemaVersion: 1,
    updatedAt: "2026-09-12",
    providers: {
      openrouter: { maxConcurrent: 5 },
      "openai-tts": { maxConcurrent: 5 },
      fal: { maxConcurrent: 5 },
    },
    llm: [
      {
        ...baseModel,
        provider: "openrouter",
        id: "llm",
        llm: { webSearch: true, thinking: { high: { effort: "high" } } },
      },
    ],
    tts: [
      {
        ...baseModel,
        provider: "openai-tts",
        id: "tts",
        tts: { maxCharacters: 20, streaming: true },
      },
    ],
    image: [
      { ...baseModel, provider: "fal", id: "image", image: { aspectRatios: ["16:9", "9:16"] } },
    ],
  };
  const catalogue: CatalogueStore = {
    read: () => value,
    models: (provider, family) => value[family].filter((row) => row.provider === provider),
    refresh: async () => {},
    status: () => ({ updatedAt: "2026-09-12", path: "unused", warning: null, source: "test" }),
  };
  const llm = {
    ...fakeLlm(),
    complete: async function* (request: LlmCompletion): AsyncGenerator<LlmEvent> {
      seen.push(request);
      const text = request.messages[0]?.content ?? "";
      if (text.startsWith("You are planning")) await pending;
      yield {
        type: "delta",
        text: text.startsWith("You are planning")
          ? "Origins\nUsage"
          : text.startsWith("You are researching") || text.startsWith("You are the editor")
            ? "Verified notes.\nSources\nhttps://example.test/rope"
            : text.startsWith("Write introduction")
              ? "Welcome."
              : text.startsWith("Write introduction")
                ? "Welcome."
                : "First sentence. Second sentence. Third sentence.",
      };
      yield { type: "done", usage: { inputTokens: 1, outputTokens: 2 }, finishReason: "stop" };
    },
  };
  const tts = fakeTts({ bytesFor: () => [tone()] });
  const images = fakeImage();
  const registry = curateRegistry(
    { llm: () => llm, tts: () => tts, image: () => images, list: async () => [] },
    catalogue,
  );
  const hub = createHub({
    ids: deps.ids,
    log: deps.log,
    acceptEvent: (event) => currentProjectEvent(deps.db, event),
  });
  const audioPreviews = createAudioPreviewStore();
  const runner = wireRunner({
    ...deps,
    ffmpeg: resolveFfmpeg({}, ffmpegStatic),
    catalogue,
    hub,
    audioPreviews,
    telemetry: { ...deps, appVersion: "test" },
    flusher: { soon: () => {}, stop: () => {} },
    registry,
  });
  try {
    for (const kind of ["article", "image"] as const)
      insertPrompt(deps.db, {
        id: kind,
        kind,
        name: kind,
        body: `A ${kind} about rope.`,
        slots: [],
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
    await app.request("/api/telemetry/notice", { method: "POST" });
    insertEntry(deps.db, {
      id: "intro",
      category: "intro",
      mode: "llm",
      name: "Intro",
      body: "Write introduction.",
      slots: [],
      updatedAt: "2026-09-12",
    });
    insertEntry(deps.db, {
      id: "outro",
      category: "outro",
      mode: "text",
      name: "Outro",
      body: "Goodbye.",
      slots: [],
      updatedAt: "2026-09-12",
    });
    const response = await app.request("/api/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...h.config,
        sources: {
          ...h.config.sources,
          research: "generate",
          article: "generate",
          audio: "generate",
          images: "generate",
        },
        articlePrompt: "article",
        intro: { name: "Intro", mode: "llm" },
        outro: { name: "Outro", mode: "text" },
        imagePrompts: [{ name: "image", number: 2 }],
        llm: { provider: "openrouter", model: "llm", thinking: "high" },
        audio: { provider: "openai-tts", model: "tts", voice: "voice" },
        images: { provider: "fal", model: "image" },
        provided: {},
      }),
    });
    expect(response.status, JSON.stringify(logs) + (await response.clone().text())).toBe(201);
    const { project } = (await response.json()) as { project: { id: string } };
    await expect.poll(() => images.calls()).toBe(2);
    expect(tts.seen()).not.toContain("First sentence.");
    const origin = currentRevisionId(deps.db, project.id);
    if (origin === undefined) throw new Error("Missing revision");
    const base = getRevisionView(deps, project.id, origin);
    if (base === undefined) throw new Error("Missing baseline");
    const saved = await saveRevision(deps, {
      projectId: project.id,
      baseRevisionId: origin,
      idempotencyKey: "rename",
      edit: {
        config: base.revision.config,
        content: base.revision.content,
      },
    });
    if (!saved.ok) throw new Error(JSON.stringify(saved));
    value = {
      ...value,
      llm: value.llm.map((model) => ({
        ...model,
        llm: { ...model.llm, webSearch: true, thinking: { high: { effort: "low" } } },
      })),
    };
    release();
    await runner.settled();
    const finished = await app.request(`/api/projects/${project.id}`);
    expect(await finished.json(), JSON.stringify(logs)).toMatchObject({
      project: { status: "done" },
    });
    expect(seen).toHaveLength(6);
    expect(seen.every((request) => request.thinkingConfig?.effort === "high")).toBe(true);
    expect(tts.calls()).toBe(5);
    const current = getRevisionView(deps, project.id, saved.view.revision.id);
    const wav = current?.outputs.find(
      (output) => output.selected && output.output.role === "audio_export",
    );
    if (wav === undefined) throw new Error("Missing WAV");
    expect(
      readFileSync(outputPath(deps.paths, project.id, wav.output.path))
        .subarray(0, 4)
        .toString(),
    ).toBe("RIFF");
    expect(deps.db.prepare("SELECT DISTINCT revision_id FROM attempts").all()).toEqual([
      { revision_id: origin },
    ]);
    expect(audioPreviews.list(project.id)).toHaveLength(0);
    expect(
      current?.outputs.find((output) => output.selected && output.output.role === "audio_body")
        ?.output.meta,
    ).toMatchObject({ provider: "openai-tts", model: "tts", voice: "voice" });
    expect(
      deps.db
        .prepare(
          "SELECT json_extract(payload,'$.segment') AS segment FROM telemetry_events WHERE json_extract(payload,'$.stage')='article' AND json_extract(payload,'$.segment') IS NOT NULL",
        )
        .all(),
    ).toEqual([{ segment: "intro" }]);
    const instructions = current?.outputs.find(
      (output) =>
        output.selected &&
        output.output.role === "instructions" &&
        output.output.stageKind === "article",
    );
    if (instructions === undefined) throw new Error("Missing instructions");
    expect(
      readFileSync(outputPath(deps.paths, project.id, instructions.output.path), "utf8"),
    ).toContain("## Intro");
  } finally {
    release();
    await runner.settled();
    h.close();
  }
}, 30_000);
