import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { createRunner } from "../../kernel/runner/index.js";
import type { StageProviders } from "../../kernel/runner/providers.js";
import { claimWork, finishWork, maySubmit } from "../../kernel/runner/work-authority.js";
import { resolveFont } from "../fonts/index.js";
import { saveRevision } from "../revisions/mutations.js";
import { outputPath } from "../storage/layout.js";
import { insertStagedFile } from "../storage/repo.js";
import { runFfmpeg } from "../video/ffmpeg.js";
import { exportFixture } from "./runtime-export.fake.js";
import { executeExportRecipe } from "./runtime-export.js";
import { runRevisionInvocation } from "./runtime-run.js";
import { executionStages, invocationReady } from "./runtime-store.js";
import { executeSubtitleRecipe } from "./runtime-subtitles.js";
import { createRebuildDeps } from "./service.fake.js";
import { previewRebuild, startRebuild } from "./service.js";
import { workPieces } from "./work-records.js";

vi.mock("../video/ffmpeg.js", async (original) => ({
  ...(await original<typeof import("../video/ffmpeg.js")>()),
  runFfmpeg: vi.fn(async (run: { readonly args: readonly string[] }) => {
    const path = run.args.at(-1);
    if (path === undefined) throw new Error("No output");
    writeFileSync(path, "rendered");
  }),
}));
vi.mock("../fonts/index.js", () => ({
  resolveFont: vi.fn(async (paths: { readonly dataDir: string }) => {
    const path = join(paths.dataDir, "font.ttf");
    writeFileSync(path, "font");
    return { id: "default", name: "Test", assName: "Test", extension: ".ttf", path };
  }),
}));

it("waits for the entire caption bundle repair before running burned video once", async () => {
  const h = await exportFixture();
  let release = (): void => undefined;
  const fontPending = new Promise<void>((resolve) => {
    release = resolve;
  });
  let entered = (): void => undefined;
  const fontEntered = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const unexpectedProvider = vi.fn(async (): Promise<never> => {
    throw new Error("Local repair must not call a provider");
  });
  const providers: StageProviders = {
    llm: unexpectedProvider,
    tts: unexpectedProvider,
    image: unexpectedProvider,
    forPiece: () => providers,
  };
  const runner = createRunner({
    stages: {
      stagesOf: (id) => executionStages(h.deps, id),
      ready: (work) => invocationReady(h.deps, work),
      maySubmit: (work, id) => maySubmit(h.deps.db, work, id),
      claim: (work) => claimWork(h.deps.db, work),
      finish: (work, state, reason) => finishWork(h.deps.db, work, state, reason),
    },
    runs: { video: (context) => runRevisionInvocation(h.deps, context, providers) },
    emit: () => undefined,
    emitRunningCount: () => undefined,
    log: h.deps.log,
  });
  try {
    const old = h.view();
    writeFileSync(join(h.deps.paths.staging, "image"), "image");
    insertStagedFile(h.deps.db, {
      id: "image",
      stageKind: "images",
      path: "image",
      originalFilename: "image.png",
      bytes: 5,
      state: "staged",
      createdAt: h.deps.clock.now().toISOString(),
    });
    const saved = await saveRevision(h.deps, {
      projectId: h.projectId,
      baseRevisionId: old.revision.id,
      idempotencyKey: "burn",
      edit: {
        config: {
          ...old.revision.config,
          sources: { ...old.revision.config.sources, images: "provide", video: "generate" },
          subtitles: {
            mode: "burn-in",
            language: "en",
            fontId: "default",
            fontSize: 48,
            position: "bottom",
          },
        },
        content: {
          ...old.revision.content,
          imageOrder: ["one"],
          imageDefinitions: { one: { source: "provide", assetId: null, prompt: null } },
        },
        uploads: [{ stagedFileId: "image", destination: { kind: "image", imageKey: "one" } }],
      },
    });
    if (!saved.ok) throw new Error(JSON.stringify(saved));
    const revisionId = saved.view.revision.id;
    for (const key of ["subtitles:cues", "subtitles:files", "export:video"]) {
      const part = h.grant(key, revisionId);
      const execute = key === "export:video" ? executeExportRecipe : executeSubtitleRecipe;
      await execute(h.deps, part.context, part.piece);
      h.deps.db
        .prepare("UPDATE revision_work SET state='done' WHERE id=?")
        .run(part.context.work.workId);
    }
    const finished = h.view(revisionId);
    for (const role of ["subtitle_font", "video"]) {
      const output = finished.outputs.find((row) => row.selected && row.output.role === role);
      if (output === undefined) throw new Error(`Missing ${role}`);
      rmSync(outputPath(h.deps.paths, h.projectId, output.output.path));
    }
    const helper = createRebuildDeps(h.deps);
    const preview = await previewRebuild(helper.deps, {
      projectId: h.projectId,
      baseRevisionId: revisionId,
      request: { kind: "allAffected" },
    });
    if (!preview.ok) throw new Error(JSON.stringify(preview));
    expect(
      preview.value.work.filter((row) => row.disposition !== "reuse").map((row) => row.key),
    ).toEqual(["subtitles:files", "export:video"]);
    const started = await startRebuild(helper.deps, {
      projectId: h.projectId,
      baseRevisionId: revisionId,
      idempotencyKey: "e78b053e-ed69-4c59-9a23-4337031cba32",
      previewId: preview.value.id,
      acknowledgeUnknownCosts: true,
      confirmedProvidedWorkKeys: preview.value.providedReuseRequired,
    });
    if (!started.ok) throw new Error(JSON.stringify(started));
    const video = executionStages(h.deps, h.projectId).find(
      (stage) =>
        stage.state === "pending" &&
        workPieces(h.deps.db, stage.work.workId).some((piece) => piece.key === "export:video"),
    );
    if (video === undefined) throw new Error("No pending export");
    const fontImplementation = vi.mocked(resolveFont).getMockImplementation();
    if (fontImplementation === undefined) throw new Error("No font resolver");
    vi.mocked(resolveFont).mockImplementationOnce(async (...args) => {
      entered();
      await fontPending;
      return fontImplementation(...args);
    });
    vi.mocked(runFfmpeg).mockClear();
    runner.tick(h.projectId);
    await fontEntered;
    expect(invocationReady(h.deps, video.work)).toBe(false);
    expect(
      h.deps.db.prepare("SELECT state FROM revision_work WHERE id=?").get(video.work.workId),
    ).toMatchObject({ state: "pending" });
    expect(runFfmpeg).not.toHaveBeenCalled();
    release();
    await runner.settled();
    expect(
      h.deps.db
        .prepare("SELECT state,failure_reason FROM revision_work WHERE id=?")
        .get(video.work.workId),
    ).toMatchObject({ state: "done", failure_reason: null });
    // One render: its clip, then the join that burns the captions in.
    const renders = (): number =>
      vi.mocked(runFfmpeg).mock.calls.filter(([run]) => run.args.includes("concat")).length;
    expect(renders()).toBe(1);
    expect(
      h
        .view(revisionId)
        .outputs.some(
          (row) => row.selected && row.available && row.output.role === "subtitle_font",
        ),
    ).toBe(true);
    runner.tick(h.projectId);
    await runner.settled();
    expect(renders()).toBe(1);
    expect(unexpectedProvider).not.toHaveBeenCalled();
  } finally {
    release();
    await runner.settled();
    h.close();
  }
});
