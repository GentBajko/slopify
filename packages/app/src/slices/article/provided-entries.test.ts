import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { fixedClock } from "../../kernel/clock.fake.js";
import { openDb } from "../../kernel/db/index.js";
import { migrate } from "../../kernel/db/migrate.js";
import { ensureDirs, layout } from "../../kernel/paths.js";
import type { StageContext } from "../../kernel/runner/index.js";
import { piecesOf } from "../../kernel/runner/piece-repo.js";
import type { LlmAnswer, LlmCall, StageProviders } from "../../kernel/runner/providers.js";
import type { RunConfig } from "../admission/model.js";
import { insertProject, insertStage, stagesOf } from "../admission/repo.js";
import { initialState } from "../admission/start.js";
import { rerunStage } from "../reruns/index.js";
import { outputsOf } from "../storage/repo.js";
import { recordingCounter } from "../telemetry/record.fake.js";
import { prepareProvidedArticleSegments } from "./provided-entries.js";
import type { ArticleDeps } from "./run.js";
import { storeArticleText } from "./store.js";

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

function harness(over: Partial<RunConfig> = {}) {
  const paths = layout(mkdtempSync(join(tmpdir(), "slopify-provided-entries-")));
  ensureDirs(paths, { mode: 0o700 });
  const db = openDb(paths.db);
  cleanups.push(() => {
    db.close();
    rmSync(paths.dataDir, { recursive: true, force: true });
  });
  const clock = fixedClock("2026-09-09T10:00:00.000Z");
  migrate(db, clock);
  const config: RunConfig = {
    title: "Rope",
    format: "16:9",
    sources: {
      research: "off",
      article: "provide",
      audio: "generate",
      images: "off",
      thumbnail: "off",
      video: "off",
    },
    imagePrompts: [],
    values: { topic: "rope" },
    provided: {},
    silenceGapSeconds: 3,
    intro: { name: "Welcome", mode: "text" },
    outro: { name: "Ending", mode: "text" },
    rendered: { intro: "Welcome to rope.", outro: "Goodbye." },
    ...over,
  };
  insertProject(db, {
    id: "p1",
    title: config.title,
    format: config.format,
    config,
    createdAt: clock.now().toISOString(),
    updatedAt: clock.now().toISOString(),
  });
  for (const kind of ["article", "audio"] as const)
    insertStage(db, {
      id: kind,
      projectId: "p1",
      kind,
      source: config.sources[kind],
      state: initialState(config.sources[kind]),
      failureReason: null,
      attemptCount: 0,
      progressCurrent: null,
      progressTotal: null,
      startedAt: null,
      finishedAt: null,
    });
  let id = 0;
  const counted = recordingCounter();
  const deps: ArticleDeps = {
    db,
    paths,
    clock,
    ids: { next: () => `id${String(++id)}` },
    log: { write: () => {} },
    count: counted.count,
  };
  storeArticleText(deps, {
    projectId: "p1",
    markdown: "# Rope\n\nRope is **twisted** fibre.\n\n## Sources Consulted\nSecret source.",
  });
  const controller = new AbortController();
  const context: StageContext = {
    stage: { id: "audio", projectId: "p1", kind: "audio", state: "running" },
    signal: controller.signal,
    emit: () => {},
  };
  const segments = () => piecesOf(db, "article", "segment");
  const instructions = () =>
    readFileSync(join(paths.projects, "p1", "instructions-article.txt"), "utf8");
  return { deps, config, context, controller, counted, segments, instructions };
}

function fake(answer: (call: LlmCall) => Promise<string> = async () => "Generated text.") {
  const calls: LlmCall[] = [];
  const providers: StageProviders = {
    llm: async (call) => {
      calls.push(call);
      const result: LlmAnswer = { text: await answer(call), usage: null, finishReason: "stop" };
      const error = call.check?.(result);
      if (error) throw new Error(error);
      return result;
    },
    tts: async () => {
      throw new Error("Entry preparation must not narrate");
    },
    image: async () => {
      throw new Error("Entry preparation must not draw");
    },
    forPiece: () => providers,
  };
  return { calls, providers };
}

describe("entries for a provided article", () => {
  it("prepares text entries without an LLM and preserves them across an audio rerun", async () => {
    const h = harness();
    const llm = fake();
    await prepareProvidedArticleSegments(h.deps, h.context, llm.providers);
    const pieces = h.segments();
    expect(pieces.map((piece) => JSON.parse(piece.payload ?? "null").text)).toEqual([
      "Welcome to rope.",
      "Goodbye.",
    ]);
    expect(pieces.every((piece) => piece.state === "done" && piece.stageId === "article")).toBe(
      true,
    );
    expect(llm.calls).toHaveLength(0);
    expect(stagesOf(h.deps.db, "p1").find((stage) => stage.kind === "article")?.state).toBe(
      "provided",
    );
    h.deps.db.exec("UPDATE stages SET state='done' WHERE id='audio'");
    expect(rerunStage(h.deps, "p1", "audio").ok).toBe(true);
    await prepareProvidedArticleSegments(h.deps, h.context, llm.providers);
    expect(h.segments()).toEqual(pieces);
    expect(h.counted.events()).toHaveLength(2);
  });

  it("keeps a finished intro when the outro fails and resumes only the missing text", async () => {
    const h = harness({
      llm: { provider: "openrouter", model: "model" },
      intro: { name: "Hook", mode: "llm" },
      outro: { name: "Ending", mode: "llm" },
      rendered: { intro: "Write the intro.", outro: "Write the outro." },
    });
    const first = fake(async (call) => {
      if (call.messages[0]?.content.startsWith("Write the outro")) throw new Error("interrupted");
      return "Kept introduction.";
    });
    await expect(
      prepareProvidedArticleSegments(h.deps, h.context, first.providers),
    ).rejects.toThrow("interrupted");
    const intro = h.segments()[0];
    expect(h.instructions()).toContain("=== Intro ===");
    const second = fake(async () => "Finished ending.");
    await prepareProvidedArticleSegments(h.deps, h.context, second.providers);
    expect(second.calls).toHaveLength(1);
    expect(second.calls[0]?.messages[0]?.content).toContain("Write the outro.");
    expect(second.calls[0]?.messages[0]?.content).toContain("Rope is twisted fibre.");
    expect(second.calls[0]?.messages[0]?.content).toContain("topic: rope");
    expect(second.calls[0]?.messages[0]?.content).not.toContain("Secret source");
    expect(h.segments()[0]).toEqual(intro);
    expect(h.segments().map((piece) => JSON.parse(piece.payload ?? "null").text)).toEqual([
      "Kept introduction.",
      "Finished ending.",
    ]);
    expect(h.instructions()).toContain("=== Intro ===");
    expect(h.instructions()).toContain("=== Outro ===");
    expect(h.counted.events()).toHaveLength(2);
  });

  it("does not commit a late LLM answer after pause aborts the audio context", async () => {
    const h = harness({
      llm: { provider: "openrouter", model: "model" },
      intro: { name: "Hook", mode: "llm" },
    });
    const llm = fake(async () => {
      h.controller.abort();
      return "Too late.";
    });
    await expect(
      prepareProvidedArticleSegments(h.deps, h.context, llm.providers),
    ).rejects.toThrow();
    expect(h.segments()).toEqual([]);
    expect(outputsOf(h.deps.db, "p1").some((output) => output.role === "instructions")).toBe(false);
  });

  it("rejects empty LLM entries through the existing provider check", async () => {
    const h = harness({
      llm: { provider: "openrouter", model: "model" },
      intro: { name: "Hook", mode: "llm" },
    });
    await expect(
      prepareProvidedArticleSegments(h.deps, h.context, fake(async () => " ").providers),
    ).rejects.toThrow("intro answered with nothing");
    expect(h.segments()).toEqual([]);
  });

  it("requires an LLM only for LLM-mode entries", async () => {
    const h = harness({ intro: { name: "Hook", mode: "llm" } });
    await expect(
      prepareProvidedArticleSegments(h.deps, h.context, fake().providers),
    ).rejects.toThrow(/LLM provider/);
  });

  it.each(["off", "provide"] as const)(
    "does no entry preparation when Audio is %s",
    async (audio) => {
      const h = harness();
      h.deps.db
        .prepare("UPDATE projects SET config=? WHERE id='p1'")
        .run(JSON.stringify({ ...h.config, sources: { ...h.config.sources, audio } }));
      const llm = fake();
      await prepareProvidedArticleSegments(h.deps, h.context, llm.providers);
      expect(h.segments()).toEqual([]);
      expect(llm.calls).toHaveLength(0);
    },
  );
});
