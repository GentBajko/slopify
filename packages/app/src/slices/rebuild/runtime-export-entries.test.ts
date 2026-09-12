import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import type { StageContext } from "../../kernel/runner/index.js";
import { maySubmit } from "../../kernel/runner/work-authority.js";
import type { RunConfig } from "../admission/model.js";
import { ensureBaseline } from "../revisions/adopt.js";
import type { RevisionDeps, RevisionView } from "../revisions/model.js";
import { saveRevision } from "../revisions/mutations.js";
import { revisionFixture } from "../revisions/revision.fake.js";
import { getRevisionView } from "../revisions/view.js";
import { outputPath } from "../storage/layout.js";
import { insertOutput, insertStagedFile } from "../storage/repo.js";
import { runFfmpeg } from "../video/ffmpeg.js";
import { insertInvocation } from "./runtime-admission.js";
import { exportCatalogue } from "./runtime-export.fake.js";
import { executeExportRecipe } from "./runtime-export.js";
import { executionPlan } from "./runtime-plan.js";
import { executeSubtitleRecipe } from "./runtime-subtitles.js";
import { workPieces } from "./work-records.js";

vi.mock("../video/ffmpeg.js", async (original) => ({
  ...(await original<typeof import("../video/ffmpeg.js")>()),
  runFfmpeg: vi.fn(async (run: { readonly args: readonly string[] }) => {
    const path = run.args.at(-1);
    if (path === undefined) throw new Error("Missing export destination");
    writeFileSync(path, "rebuilt audio");
  }),
}));

function grant(deps: RevisionDeps, view: RevisionView, key: "export:wav" | "subtitles:timing") {
  const recipe = executionPlan(deps, view, exportCatalogue).recipes.find((one) => one.key === key);
  if (recipe === undefined) throw new Error(`Missing ${key} recipe`);
  deps.db
    .prepare("DELETE FROM revision_work_reservations WHERE revision_id=? AND work_key=?")
    .run(view.revision.id, key);
  const work = insertInvocation(
    deps,
    view,
    recipe,
    exportCatalogue,
    { key, fingerprint: view.revision.fingerprints[key] ?? recipe.logicalFingerprint },
    false,
  );
  const piece = workPieces(deps.db, work.workId)[0];
  if (piece === undefined) throw new Error("Missing work piece");
  const context: StageContext = {
    work,
    stage: {
      id: work.stageId,
      projectId: work.projectId,
      kind: work.kind,
      state: "running",
      work,
    },
    signal: new AbortController().signal,
    maySubmit: (id) => maySubmit(deps.db, work, id),
    emit: () => undefined,
  };
  return { context, piece };
}

it.each([
  {
    name: "removes intro while retaining outro",
    source: "generate",
    intro: false,
    outro: true,
    timeline: ["body", "gap", "outro"],
    texts: ["Saved article.", "Goodbye"],
    starts: [0, 4.5],
    durationMs: 5500,
  },
  {
    name: "removes outro while retaining intro",
    source: "generate",
    intro: true,
    outro: false,
    timeline: ["intro", "gap", "body"],
    texts: ["Welcome", "Saved article."],
    starts: [0, 1.5],
    durationMs: 5500,
  },
  {
    name: "removes both entries",
    source: "generate",
    intro: false,
    outro: false,
    timeline: ["body"],
    texts: ["Saved article."],
    starts: [0],
    durationMs: 4000,
  },
  {
    name: "switches generated narration to provided audio with retained entries",
    source: "provide",
    intro: true,
    outro: true,
    timeline: ["body"],
    texts: ["Saved article."],
    starts: [0],
    durationMs: 4000,
  },
] as const)("$name in both the export and subtitle timeline", async (scenario) => {
  const h = revisionFixture();
  try {
    const config: RunConfig = {
      ...h.config,
      sources: { ...h.config.sources, audio: "generate" },
      audio: { provider: "voice", model: "tts", voice: "v" },
      intro: { name: "Intro", mode: "text" },
      outro: { name: "Outro", mode: "text" },
      rendered: { intro: "Welcome", outro: "Goodbye" },
      silenceGapSeconds: 0.5,
      subtitles: {
        mode: "files",
        language: "en",
        fontId: "default",
        fontSize: 48,
        position: "bottom",
      },
    };
    h.deps.db
      .prepare("UPDATE projects SET config=? WHERE id=?")
      .run(JSON.stringify(config), h.projectId);
    for (const role of ["audio_intro", "audio_body", "audio_outro", "audio_export"] as const) {
      const path = `${role}.wav`;
      writeFileSync(join(h.deps.paths.projects, h.projectId, path), "old audio");
      insertOutput(h.deps.db, {
        id: role,
        projectId: h.projectId,
        stageKind: role === "audio_export" ? "video" : "audio",
        role,
        path,
        originalFilename: null,
        bytes: 9,
        durationMs: role === "audio_body" ? 4000 : 1000,
        meta: {},
        createdAt: h.deps.clock.now().toISOString(),
      });
    }
    const baseline = await ensureBaseline(h.deps, h.projectId);
    if (!baseline.ok) throw new Error(JSON.stringify(baseline));
    if (scenario.source === "provide") {
      writeFileSync(join(h.deps.paths.staging, "provided"), "supplied audio");
      insertStagedFile(h.deps.db, {
        id: "provided",
        stageKind: "audio",
        path: "provided",
        originalFilename: "provided.wav",
        bytes: 14,
        state: "staged",
        createdAt: h.deps.clock.now().toISOString(),
      });
    }
    const { intro, outro, ...withoutEntries } = config;
    const saved = await saveRevision(
      { ...h.deps, measureAudio: async () => 4000 },
      {
        projectId: h.projectId,
        baseRevisionId: baseline.view.revision.id,
        idempotencyKey: "change-entries",
        edit: {
          config: {
            ...withoutEntries,
            sources: { ...config.sources, audio: scenario.source },
            ...(scenario.intro ? { intro } : {}),
            ...(scenario.outro ? { outro } : {}),
          },
          content: baseline.view.revision.content,
          uploads:
            scenario.source === "provide"
              ? [{ stagedFileId: "provided", destination: { kind: "provided", stage: "audio" } }]
              : [],
        },
      },
    );
    if (!saved.ok) throw new Error(JSON.stringify(saved));
    const retained = saved.view.outputs.filter(
      (row) => row.output.role === "audio_intro" || row.output.role === "audio_outro",
    );
    expect(retained).toHaveLength(2);
    expect(retained.every((row) => row.selected && row.available && row.state === "ready")).toBe(
      true,
    );
    const alignSubtitles = vi.fn(async (input: { readonly text: string }) => [
      { text: input.text.trim(), start: 0, end: 0.5 },
    ]);
    const deps = { ...h.deps, ffmpeg: "unused", measureAudio: async () => 4000, alignSubtitles };
    vi.mocked(runFfmpeg).mockClear();
    const media = grant(deps, saved.view, "export:wav");
    expect(await executeExportRecipe(deps, media.context, media.piece)).toBe("done");
    const timing = grant(deps, saved.view, "subtitles:timing");
    expect(await executeSubtitleRecipe(deps, timing.context, timing.piece)).toBe("done");
    const current = getRevisionView(deps, h.projectId, saved.view.revision.id);
    if (current === undefined) throw new Error("Missing saved revision");
    const render = current.outputs.find(
      (row) => row.selected && row.output.role === "render_params",
    );
    const words = current.outputs.find(
      (row) => row.selected && row.output.role === "subtitle_words",
    );
    if (render === undefined || words === undefined) throw new Error("Missing completed outputs");
    expect(
      JSON.parse(readFileSync(outputPath(deps.paths, h.projectId, render.output.path), "utf8")),
    ).toMatchObject({
      totalSeconds: scenario.durationMs / 1000,
      audio: scenario.timeline.map((kind) => ({ kind })),
    });
    expect(
      JSON.parse(readFileSync(outputPath(deps.paths, h.projectId, words.output.path), "utf8")),
    ).toMatchObject({
      words: scenario.texts.map((text, index) => ({ text, start: scenario.starts[index] })),
    });
    expect(alignSubtitles.mock.calls.map(([input]) => input.text.trim())).toEqual(scenario.texts);
    expect(
      current.outputs.find((row) => row.selected && row.output.role === "audio_export")?.output
        .durationMs,
    ).toBe(scenario.durationMs);
    expect(vi.mocked(runFfmpeg)).toHaveBeenCalledTimes(1);
    for (const row of retained) {
      expect(current.outputs.some((one) => one.assetId === row.assetId && one.available)).toBe(
        true,
      );
      expect(existsSync(outputPath(deps.paths, h.projectId, row.output.path))).toBe(true);
    }
  } finally {
    h.close();
  }
});
