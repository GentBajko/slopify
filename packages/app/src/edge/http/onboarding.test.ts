import { randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import type { CatalogueStore } from "../../catalog/store.js";
import { parseCatalogue } from "../../catalog/store.js";
import { fixedClock } from "../../kernel/clock.fake.js";
import { openDb } from "../../kernel/db/index.js";
import { migrate } from "../../kernel/db/migrate.js";
import { ulidIds } from "../../kernel/ids.js";
import { ensureDirs, layout } from "../../kernel/paths.js";
import type { RunConfig } from "../../slices/admission/model.js";
import { projectById } from "../../slices/admission/repo.js";
import { seedSamples } from "../../slices/onboarding/sample.js";
import { readPackRecords } from "../../slices/onboarding/state.js";
import { currentRevisionId } from "../../slices/revisions/repo.js";
import { upsertKey } from "../../slices/settings/repo.js";
import { createHub } from "../events/hub.js";
import { createApp } from "./app.js";

const clock = fixedClock("2026-09-27T10:00:00.000Z");
const value = parseCatalogue(
  readFileSync(new URL("../../assets/models.yaml", import.meta.url), "utf8"),
);
const catalogue: CatalogueStore = {
  read: () => value,
  models: (provider, family) => value[family].filter((row) => row.provider === provider),
  refresh: async () => undefined,
  status: () => ({ updatedAt: value.updatedAt, path: "test", warning: null, source: "test" }),
};
const cleanup: (() => void)[] = [];
afterEach(() => {
  for (const done of cleanup.splice(0)) done();
});

function harness(installed: readonly string[] = ["claude", "codex"]): {
  readonly app: ReturnType<typeof createApp>;
  readonly db: DatabaseSync;
  readonly paths: ReturnType<typeof layout>;
  readonly ticked: string[];
} {
  const paths = layout(mkdtempSync(join(tmpdir(), "slopify-onboarding-")));
  ensureDirs(paths, { mode: 0o700 });
  const db = openDb(paths.db);
  migrate(db, clock);
  cleanup.push(() => {
    db.close();
    rmSync(paths.dataDir, { recursive: true, force: true });
  });
  const log = { write: () => undefined };
  const ticked: string[] = [];
  const app = createApp({
    db,
    paths,
    hub: createHub({ ids: ulidIds, log }),
    runner: {
      tick: (projectId) => {
        ticked.push(projectId);
      },
      settled: async () => undefined,
      abortProject: async () => undefined,
      abortAll: async () => undefined,
    },
    catalogue,
    clock,
    ids: ulidIds,
    log,
    version: "3.0.0",
    webDist: join(paths.dataDir, "missing"),
    flushSoon: () => undefined,
    // Claude Code and Codex answer; nothing else is installed unless the test says.
    probe: async (binary) =>
      !installed.includes(binary)
        ? { ran: false, stdout: "" }
        : binary === "espeak-ng"
          ? { ran: true, stdout: " 5  en-us  --/M  English_(America)  gmw/en-US\n" }
          : {
              ran: true,
              stdout: binary === "codex" ? "codex-cli 0.160.0" : "2.1.300 (Claude Code)",
            },
    speechHost: { platform: "linux", env: {} },
    modelsFor: async (provider, family) =>
      family === "llm"
        ? [
            { id: "opus", name: "Opus" },
            { id: "sonnet", name: "Sonnet" },
          ]
        : family === "image"
          ? [{ id: "codex-imagegen", name: "Codex default" }]
          : value.tts
              .filter((row) => row.provider === provider)
              .map((row) => ({ id: row.id, name: row.name })),
  });
  return { app, db, paths, ticked };
}

async function json(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

describe("the first-run screen", () => {
  it("shows on a fresh install with what this machine can already do", async () => {
    const h = harness();
    const view = await json(await h.app.request("/api/onboarding"));
    expect(view).toMatchObject({
      show: true,
      sampleProjectId: null,
      clis: [
        { id: "claude-code", installed: true, ready: true, version: "2.1.300", draws: false },
        { id: "codex", installed: true, ready: true, version: "0.160.0", draws: true },
        { id: "gemini", installed: false, ready: false },
      ],
    });
    expect((view.packs as unknown[]).length).toBe(4);
  });

  it("is never shown again once it is skipped", async () => {
    const h = harness();
    expect((await h.app.request("/api/onboarding/dismiss", { method: "POST" })).status).toBe(200);
    expect(await json(await h.app.request("/api/onboarding"))).toMatchObject({ show: false });
  });

  it("still shows beside the sample, and never again once a real project exists", async () => {
    const h = harness();
    await seedSamples({
      db: h.db,
      paths: h.paths,
      clock,
      ids: ulidIds,
      log: { write: () => undefined },
      appVersion: "3.0.0",
    });
    const sample = await json(await h.app.request("/api/onboarding"));
    expect(sample).toMatchObject({ show: true });
    expect(typeof sample.sampleProjectId).toBe("string");
    upsertKey(h.db, "openai-tts", "sk-test", clock.now().toISOString());
    const made = await h.app.request("/api/onboarding/short", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ topic: "why the sea glows", requestId: randomUUID() }),
    });
    expect(made.status).toBe(201);
    expect(await json(await h.app.request("/api/onboarding"))).toMatchObject({ show: false });
    const { projectId } = (await made.json()) as { projectId: string };
    await h.app.request(`/api/projects/${projectId}`, { method: "DELETE" });
    expect(await json(await h.app.request("/api/onboarding"))).toMatchObject({ show: false });
  });
});

describe("starter packs over HTTP", () => {
  it("installs a pack once and refuses one that doesn't exist", async () => {
    const h = harness();
    const first = await json(
      await h.app.request("/api/onboarding/packs/history", { method: "POST" }),
    );
    const again = await json(
      await h.app.request("/api/onboarding/packs/history", { method: "POST" }),
    );
    expect(first).toMatchObject({ packId: "history", added: true });
    expect(again).toMatchObject({ packId: "history", added: false, templateId: first.templateId });
    expect(await json(await h.app.request("/api/onboarding"))).toMatchObject({
      packs: expect.arrayContaining([expect.objectContaining({ id: "history", installed: true })]),
    });
    expect((await h.app.request("/api/onboarding/packs/cooking", { method: "POST" })).status).toBe(
      404,
    );
  });
});

describe("Make a 60-second short", () => {
  it("starts a short-mode project from a topic with the CLIs and a voice key", async () => {
    const h = harness();
    upsertKey(h.db, "openai-tts", "sk-test", clock.now().toISOString());
    const requestId = randomUUID();
    const post = () =>
      h.app.request("/api/onboarding/short", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          topic: "  the Library of Alexandria ",
          packId: "history",
          requestId,
        }),
      });
    const made = await post();
    expect(made.status).toBe(201);
    const { projectId } = (await made.json()) as { projectId: string };
    const config = projectById(h.db, projectId)?.config as RunConfig;
    expect(config).toMatchObject({
      mode: "short",
      title: "The Library of Alexandria",
      format: "9:16",
      llm: { provider: "claude-code", model: "sonnet" },
      images: { provider: "codex-image", model: "codex-imagegen" },
      audio: { provider: "openai-tts", model: "gpt-4o-mini-tts", voice: "fable" },
      imagePrompts: [{ name: "History · Scene", number: 4 }],
      articlePrompt: "History · 60-second short",
      values: { topic: "the Library of Alexandria" },
    });
    expect(config.rendered.article).toContain("the Library of Alexandria");
    expect(currentRevisionId(h.db, projectId)).toBeDefined();
    expect(h.ticked).toEqual([projectId]);
    // A double click returns the same project.
    expect(await json(await post())).toEqual({ projectId, replayed: true });
    expect(h.ticked).toEqual([projectId]);
  });

  it("says what is missing, and where to fix it, when no voice or text model is ready", async () => {
    const h = harness([]);
    const refused = await h.app.request("/api/onboarding/short", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ topic: "tides", requestId: randomUUID() }),
    });
    expect(refused.status).toBe(409);
    const body = await json(refused);
    expect((body.gaps as { need: string }[]).map((gap) => gap.need)).toEqual([
      "text",
      "images",
      "voice",
    ]);
    expect(body.detail).toContain("Settings → Providers");
    expect(body.detail).toContain("Install espeak-ng");
    expect(h.db.prepare("SELECT count(*) AS n FROM projects").get()).toEqual({ n: 0 });
  });

  it("narrates with the computer's own voice when no voice key is saved, and saves that voice", async () => {
    const h = harness(["claude", "codex", "espeak-ng"]);
    const view = await json(await h.app.request("/api/onboarding"));
    expect(view.voice).toEqual({
      keyed: null,
      system: { available: true, engine: "eSpeak NG", issue: null },
    });
    const made = await h.app.request("/api/onboarding/short", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ topic: "tides", packId: "science", requestId: randomUUID() }),
    });
    expect(made.status).toBe(201);
    const { projectId } = (await made.json()) as { projectId: string };
    expect(projectById(h.db, projectId)?.config).toMatchObject({
      audio: { provider: "system-voice", model: "espeak-ng", voice: "en-us" },
    });
    const voices = (await json(await h.app.request("/api/settings/voices"))).voices as {
      provider: string;
      voiceId: string;
      languages?: string[];
    }[];
    expect(voices).toContainEqual(
      expect.objectContaining({ provider: "system-voice", voiceId: "en-us", languages: ["en"] }),
    );
  });

  it("prefers a voice key over the computer's voice", async () => {
    const h = harness(["claude", "codex", "espeak-ng"]);
    upsertKey(h.db, "openai-tts", "sk-test", clock.now().toISOString());
    expect((await json(await h.app.request("/api/onboarding"))).voice).toMatchObject({
      keyed: "OpenAI",
    });
    const made = await h.app.request("/api/onboarding/short", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ topic: "tides", requestId: randomUUID() }),
    });
    const { projectId } = (await made.json()) as { projectId: string };
    expect(projectById(h.db, projectId)?.config).toMatchObject({
      audio: { provider: "openai-tts" },
    });
  });
});

describe("reading the first-run screen", () => {
  it("writes nothing; a real project made elsewhere is settled by an explicit dismiss", async () => {
    const h = harness();
    await seedSamples({
      db: h.db,
      paths: h.paths,
      clock,
      ids: ulidIds,
      log: { write: () => undefined },
      appVersion: "3.0.0",
    });
    const copied = await h.app.request("/api/onboarding/sample/copy", { method: "POST" });
    expect(copied.status).toBe(201);
    const settings = () => h.db.prepare("SELECT key, value FROM settings ORDER BY key").all();
    const before = settings();
    expect(await json(await h.app.request("/api/onboarding"))).toMatchObject({
      show: false,
      settle: true,
    });
    expect(settings()).toEqual(before);
    await h.app.request("/api/onboarding/dismiss", { method: "POST" });
    expect(await json(await h.app.request("/api/onboarding"))).toMatchObject({
      show: false,
      settle: false,
    });
  });
});

describe("Make the full video on this topic", () => {
  const post = (h: ReturnType<typeof harness>, path: string, body: unknown) =>
    h.app.request(`/api/onboarding/${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  it("opens a Play draft from the short's pack template, topic and providers", async () => {
    const h = harness();
    upsertKey(h.db, "openai-tts", "sk-test", clock.now().toISOString());
    const made = await post(h, "short", {
      topic: "the Library of Alexandria",
      packId: "history",
      requestId: randomUUID(),
    });
    const { projectId } = (await made.json()) as { projectId: string };
    const draftId = randomUUID();
    const opened = await post(h, "full-video", { projectId, draftId });
    expect(opened.status).toBe(201);
    const { draft } = (await opened.json()) as {
      draft: { id: string; document: { templateSource?: { id: string }; form: unknown } };
    };
    expect(draft.id).toBe(draftId);
    expect(draft.document.form).toMatchObject({
      title: "The Library of Alexandria",
      format: "16:9",
      values: { topic: "the Library of Alexandria" },
      articlePrompt: "History · Documentary",
      llm: { provider: "claude-code", model: "sonnet" },
      images: { provider: "codex-image", model: "codex-imagegen" },
      audio: { provider: "openai-tts", model: "gpt-4o-mini-tts", voice: "fable" },
    });
    // The pack's template, installed now, is where the draft came from.
    const template = readPackRecords(h.db).history?.template;
    expect(template).toBeDefined();
    expect(draft.document.templateSource?.id).toBe(template);
    // A repeated press opens the same draft.
    const again = await post(h, "full-video", { projectId, draftId });
    expect(again.status).toBe(201);
    expect(h.db.prepare("SELECT count(*) AS n FROM play_drafts").get()).toEqual({ n: 1 });
  });

  it("uses the starter set without saving a template, and refuses a long video", async () => {
    const h = harness();
    upsertKey(h.db, "openai-tts", "sk-test", clock.now().toISOString());
    const made = await post(h, "short", { topic: "tides", requestId: randomUUID() });
    const { projectId } = (await made.json()) as { projectId: string };
    const opened = await post(h, "full-video", { projectId, draftId: randomUUID() });
    expect(opened.status).toBe(201);
    const { draft } = (await opened.json()) as {
      draft: { document: { templateSource?: unknown; form: unknown } };
    };
    expect(draft.document.templateSource).toBeUndefined();
    expect(draft.document.form).toMatchObject({ title: "Tides", values: { topic: "tides" } });
    expect(h.db.prepare("SELECT count(*) AS n FROM project_templates").get()).toEqual({ n: 0 });

    h.db
      .prepare("UPDATE projects SET config=json_remove(config,'$.mode') WHERE id=?")
      .run(projectId);
    const refused = await post(h, "full-video", { projectId, draftId: randomUUID() });
    expect(refused.status).toBe(409);
    expect((await json(refused)).detail).toContain("already a long video");
    const missing = await post(h, "full-video", { projectId: "nope", draftId: randomUUID() });
    expect(missing.status).toBe(404);
  });
});

describe("the sample over HTTP", () => {
  it("is read-only, and its copy is an ordinary project", async () => {
    const h = harness();
    await seedSamples({
      db: h.db,
      paths: h.paths,
      clock,
      ids: ulidIds,
      log: { write: () => undefined },
      appVersion: "3.0.0",
    });
    const { projectId } = (await json(await h.app.request("/api/onboarding/sample"))) as {
      projectId: string;
    };
    const revisionId = currentRevisionId(h.db, projectId) ?? "";
    const save = (id: string, base: string) =>
      h.app.request(`/api/projects/${id}/revisions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ baseRevisionId: base, idempotencyKey: randomUUID(), edit: {} }),
      });
    const refused = await save(projectId, revisionId);
    expect(refused.status).toBe(409);
    expect(await json(refused)).toMatchObject({ reason: "sample-read-only" });
    for (const action of ["pause", "cancel", "rebuild"]) {
      const response = await h.app.request(`/api/projects/${projectId}/${action}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      expect(await json(response)).toMatchObject({ reason: "sample-read-only" });
    }
    // Reading and previewing still work.
    expect((await h.app.request(`/api/projects/${projectId}`)).status).toBe(200);
    const preview = await h.app.request(`/api/projects/${projectId}/rebuild/preview`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ baseRevisionId: revisionId, request: { kind: "allAffected" } }),
    });
    expect(await json(preview)).not.toMatchObject({ reason: "sample-read-only" });

    const copied = await h.app.request("/api/onboarding/sample/copy", { method: "POST" });
    expect(copied.status).toBe(201);
    const copy = ((await copied.json()) as { projectId: string }).projectId;
    const edited = await save(copy, currentRevisionId(h.db, copy) ?? "");
    expect(await json(edited)).not.toMatchObject({ reason: "sample-read-only" });

    // Restore brings back the original after it is deleted.
    expect((await h.app.request(`/api/projects/${projectId}`, { method: "DELETE" })).status).toBe(
      204,
    );
    expect(await json(await h.app.request("/api/onboarding/sample"))).toMatchObject({
      projectId: null,
      samples: { library: null },
    });
    const restored = await h.app.request("/api/onboarding/sample/restore", { method: "POST" });
    expect(await json(restored)).toMatchObject({ projectId, samples: { library: projectId } });
  });

  it("lists the demos beside the first sample, read-only, and copies the one asked for", async () => {
    const h = harness();
    await seedSamples({
      db: h.db,
      paths: h.paths,
      clock,
      ids: ulidIds,
      log: { write: () => undefined },
      appVersion: "3.0.0",
    });
    const view = await json(await h.app.request("/api/onboarding"));
    const samples = view.samples as Record<string, string>;
    expect(Object.keys(samples)).toEqual(["library", "audiobook", "podcast"]);
    // The demos are samples, not the user's projects: the first-run screen still shows.
    expect(view.show).toBe(true);
    for (const id of [samples.audiobook, samples.podcast]) {
      const refused = await h.app.request(`/api/projects/${String(id)}/rebuild`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      expect(await json(refused)).toMatchObject({ reason: "sample-read-only" });
    }
    const copied = await h.app.request("/api/onboarding/sample/copy", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectId: samples.podcast }),
    });
    expect(copied.status).toBe(201);
    const copy = ((await copied.json()) as { projectId: string }).projectId;
    expect(
      h.db.prepare("SELECT title FROM projects WHERE id=?").get(copy) as { title: string },
    ).toEqual({ title: "The Antikythera Mechanism (my copy)" });
  });
});
