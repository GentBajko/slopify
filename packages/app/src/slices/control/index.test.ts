import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { openDb } from "../../kernel/db/index.js";
import type { StageKind } from "../../kernel/pipeline.js";
import { insertPiece, piecesOf } from "../../kernel/runner/piece-repo.js";
import {
  claimStage,
  projectById,
  projectPaused,
  setProjectPaused,
  stagesOf,
} from "../admission/repo.js";
import { deleteKey } from "../settings/repo.js";
import { insertOutput, outputsOf } from "../storage/repo.js";
import { clock, config, deferred, harness } from "./control.fake.js";
import { changeProviders, pauseProject, providerCheckTimeoutMs, resumeProject } from "./index.js";

afterEach(() => vi.useRealTimers());

describe("pause and resume", () => {
  it("drains an interrupted stage before queued provider edits and resumes, preserving completed pieces", async () => {
    const draining = deferred();
    let calls = 0;
    const choices: string[] = [];
    const h = harness(
      {
        research: "pending",
        article: "pending",
        images: "pending",
        thumbnail: "pending",
        video: "pending",
      },
      {
        research: async ({ signal }) => {
          calls += 1;
          choices.push(projectById(h.db, "p1")?.config.llm?.model ?? "missing");
          if (calls === 1) {
            insertPiece(h.db, {
              id: "kept",
              stageId: "s-research",
              kind: "chapter",
              idx: 1,
              state: "done",
              payload: '{"text":"Completed chapter"}',
            });
            await new Promise<void>((_resolve, reject) => {
              signal.addEventListener(
                "abort",
                () => {
                  void draining.promise.then(() => reject(signal.reason));
                },
                { once: true },
              );
            });
          }
        },
        article: async () => {},
        images: async () => {},
        thumbnail: async () => {},
        video: async () => {},
      },
    );
    h.runner.tick("p1");
    expect(h.state("research")).toBe("running");
    expect(h.state("images")).toBe("running");
    expect(h.state("thumbnail")).toBe("running");
    const paused = pauseProject(h.deps, "p1");
    const edited = changeProviders(h.deps, "p1", { llm: { provider: "openrouter", model: "new" } });
    const resumed = resumeProject(h.deps, "p1");
    const resumedAgain = resumeProject(h.deps, "p1");
    await Promise.resolve();
    expect(projectPaused(h.db, "p1")).toBe(true);
    expect(h.state("article")).toBe("pending");
    expect(projectById(h.db, "p1")?.config.llm?.model).toBe("old");
    draining.resolve();
    expect(await paused).toEqual({ ok: true });
    expect(await edited).toEqual({ ok: true });
    await Promise.all([resumed, resumedAgain]);
    await h.runner.settled();
    expect(choices).toEqual(["old", "new"]);
    expect(piecesOf(h.db, "s-research", "chapter")).toHaveLength(1);
    expect(
      stagesOf(h.db, "p1").every((stage) => stage.state === "done" || stage.state === "skipped"),
    ).toBe(true);
    expect(h.events).toContainEqual({ type: "project.updated", projectId: "p1" });
    h.db.close();
  });

  it("persists pause across reopen and blocks both runner ticks and direct row claims", async () => {
    const h = harness(
      { article: "pending" },
      {
        article: async () => {
          throw new Error("must remain paused");
        },
      },
    );
    await pauseProject(h.deps, "p1");
    h.runner.tick("p1");
    expect(claimStage(h.db, "s-article", clock.now().toISOString())).toBe(false);
    h.db.close();
    const reopened = openDb(h.paths.db);
    expect(projectById(reopened, "p1")?.paused).toBe(true);
    expect(claimStage(reopened, "s-article", clock.now().toISOString())).toBe(false);
    reopened.close();
  });

  it("retains work that finishes as the pause lands and releases no dependent", async () => {
    const finish = deferred();
    const h = harness(
      { article: "pending", audio: "pending" },
      {
        article: () => finish.promise,
        audio: async () => {
          throw new Error("must not start");
        },
      },
    );
    h.runner.tick("p1");
    const paused = pauseProject(h.deps, "p1");
    await Promise.resolve();
    finish.resolve();
    await paused;
    expect(h.state("article")).toBe("done");
    expect(h.state("audio")).toBe("pending");
    expect(h.runner.hasInflight?.("p1")).toBe(false);
    h.db.close();
  });

  it("resets failed and canceled work together and leaves completed outputs alone", async () => {
    const called: StageKind[] = [];
    const h = harness(
      { research: "failed", article: "canceled", images: "done" },
      {
        research: async () => {
          called.push("research");
        },
        article: async () => {
          called.push("article");
        },
      },
    );
    await resumeProject(h.deps, "p1");
    await h.runner.settled();
    expect(called).toEqual(["research", "article"]);
    expect(h.state("images")).toBe("done");
    h.db.close();
  });
});

describe("provider changes", () => {
  it("changes whole narration into chunks while failed without starting generation", async () => {
    const h = harness({ audio: "failed", article: "done" });
    insertPiece(h.db, {
      id: "old",
      stageId: "s-audio",
      kind: "chunk",
      idx: 1,
      state: "failed",
      payload: JSON.stringify({ text: "old whole text" }),
    });
    expect(await changeProviders(h.deps, "p1", { chunking: { mode: "paragraph" } })).toEqual({
      ok: true,
    });
    expect(projectById(h.db, "p1")?.config.chunking).toEqual({ mode: "paragraph" });
    expect(piecesOf(h.db, "s-audio", "chunk")).toHaveLength(0);
    expect(h.state("audio")).toBe("failed");
    expect(h.state("article")).toBe("done");
    h.db.close();
  });
  it("keeps saved prompts/uploads and clears only unfinished audio when changing voice", async () => {
    const h = harness({ audio: "failed", images: "done" });
    const dir = join(h.paths.projects, "p1");
    mkdirSync(join(dir, "audio-chunks"), { recursive: true });
    for (const path of ["audio-chunks/001.mp3", "audio.mp3", "image.png"])
      writeFileSync(join(dir, path), "data");
    insertPiece(h.db, {
      id: "audio-piece",
      stageId: "s-audio",
      kind: "chunk",
      idx: 1,
      state: "done",
      payload: '{"file":"audio-chunks/001.mp3"}',
    });
    for (const [stageKind, role, path] of [
      ["audio", "audio_body", "audio.mp3"],
      ["images", "image", "image.png"],
    ] as const)
      insertOutput(h.db, {
        id: role,
        projectId: "p1",
        stageKind,
        role,
        path,
        originalFilename: null,
        bytes: 4,
        durationMs: null,
        meta: {},
        createdAt: clock.now().toISOString(),
      });
    expect(
      await changeProviders(h.deps, "p1", {
        audio: { provider: "openai-tts", model: "new", voice: "new-voice" },
      }),
    ).toEqual({ ok: true });
    expect(projectById(h.db, "p1")?.config).toEqual({
      ...config,
      audio: { provider: "openai-tts", model: "new", voice: "new-voice" },
    });
    expect(piecesOf(h.db, "s-audio", "chunk")).toEqual([]);
    expect(outputsOf(h.db, "p1").map((output) => output.role)).toEqual(["image"]);
    expect(existsSync(join(dir, "audio-chunks/001.mp3"))).toBe(false);
    expect(existsSync(join(dir, "audio.mp3"))).toBe(false);
    expect(existsSync(join(dir, "image.png"))).toBe(true);
    expect(h.state("audio")).toBe("failed");
    h.db.close();
  });

  it("retains completed narration when the saved narrator is changed", async () => {
    const h = harness({ audio: "done", images: "failed" });
    insertPiece(h.db, {
      id: "kept",
      stageId: "s-audio",
      kind: "chunk",
      idx: 1,
      state: "done",
      payload: null,
    });
    await changeProviders(h.deps, "p1", {
      audio: { provider: "openai-tts", model: "new", voice: "new-voice" },
    });
    expect(piecesOf(h.db, "s-audio", "chunk")).toHaveLength(1);
    expect(h.state("audio")).toBe("done");
    h.db.close();
  });

  it("rejects invalid families, unconfigured providers, unknown models and voices without mutations", async () => {
    const h = harness({ article: "failed" });
    deleteKey(h.db, "fal");
    for (const changes of [
      { llm: { provider: "not-a-provider", model: "new" } },
      { llm: { provider: "fal", model: "new" } },
      { images: { provider: "fal", model: "new" } },
      { llm: { provider: "openrouter", model: "not-listed" } },
      { audio: { provider: "openai-tts", model: "new", voice: "not-saved" } },
    ])
      expect(await changeProviders(h.deps, "p1", changes)).toMatchObject({
        ok: false,
        reason: "invalid-providers",
      });
    expect(projectById(h.db, "p1")?.config).toEqual(config);
    expect(h.events).toEqual([]);
    h.db.close();
  });

  it("accepts a custom model when the adapter supports it even if discovery is unavailable", async () => {
    const h = harness({ article: "failed" });
    const result = await changeProviders(
      {
        ...h.deps,
        allowsCustomModels: (provider) => provider === "openrouter",
        modelsFor: async () => {
          throw new Error("catalog offline");
        },
      },
      "p1",
      { llm: { provider: "openrouter", model: "newly-released" } },
    );
    expect(result).toEqual({ ok: true });
    expect(projectById(h.db, "p1")?.config.llm?.model).toBe("newly-released");
    h.db.close();
  });

  it("rechecks a key removed while the model catalog was loading", async () => {
    const h = harness({ article: "failed" });
    const deps = {
      ...h.deps,
      modelsFor: async () => {
        deleteKey(h.db, "openrouter");
        return [{ id: "new", name: "New" }];
      },
    };
    expect(
      await changeProviders(deps, "p1", { llm: { provider: "openrouter", model: "new" } }),
    ).toMatchObject({ ok: false, reason: "invalid-providers" });
    expect(projectById(h.db, "p1")?.config).toEqual(config);
    h.db.close();
  });

  it("refuses running or unpaused pending work and accepts paused work", async () => {
    const h = harness({ article: "pending" });
    const choice = { llm: { provider: "openrouter", model: "new" } };
    expect(await changeProviders(h.deps, "p1", choice)).toEqual({
      ok: false,
      reason: "not-editable",
    });
    expect(
      await changeProviders(
        { ...h.deps, runner: { ...h.runner, hasInflight: () => true } },
        "p1",
        choice,
      ),
    ).toEqual({ ok: false, reason: "running" });
    setProjectPaused(h.db, "p1", true, clock.now().toISOString());
    expect(await changeProviders(h.deps, "p1", choice)).toEqual({ ok: true });
    expect(h.state("article")).toBe("pending");
    h.db.close();
  });

  it("bounds a stuck catalog so a queued resume is released with no config mutation", async () => {
    vi.useFakeTimers();
    const h = harness({ article: "failed" }, { article: async () => {} });
    const saved = changeProviders({ ...h.deps, modelsFor: () => new Promise(() => {}) }, "p1", {
      llm: { provider: "openrouter", model: "new" },
    });
    const resumed = resumeProject(h.deps, "p1");
    await vi.advanceTimersByTimeAsync(providerCheckTimeoutMs);
    expect(await saved).toEqual({ ok: false, reason: "catalog-unavailable" });
    expect(await resumed).toEqual({ ok: true });
    await h.runner.settled();
    expect(h.state("article")).toBe("done");
    expect(projectById(h.db, "p1")?.config).toEqual(config);
    h.db.close();
  });
});
