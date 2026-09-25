import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { stageKinds } from "../../kernel/pipeline.js";
import type { StageContext } from "../../kernel/runner/index.js";
import { ensureBaseline } from "../revisions/adopt.js";
import type { RevisionEdit } from "../revisions/model.js";
import { saveRevision } from "../revisions/mutations.js";
import { revisionFixture } from "../revisions/revision.fake.js";
import { getRevisionView } from "../revisions/view.js";
import { writeAsset } from "../storage/assets.js";
import { insertOutput, insertStagedFile } from "../storage/repo.js";
import { insertInvocation } from "./runtime-admission.js";
import { exportCatalogue } from "./runtime-export.fake.js";
import { executionPlan } from "./runtime-plan.js";
import { preparedResult, preparedText, publishResult } from "./runtime-publication.js";
import { workPieces } from "./work-records.js";
import { sourceOf } from "../admission/model.js";

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const close of cleanups.splice(0)) close();
});

async function fixture(durationMs: number | null, video: boolean, burnIn = false) {
  const h = revisionFixture();
  cleanups.push(h.close);
  const deps = { ...h.deps, measureAudio: async () => 4000 };
  const config = {
    ...h.config,
    sources: {
      ...h.config.sources,
      audio: "generate" as const,
      images: "provide" as const,
      video: video ? ("generate" as const) : ("off" as const),
    },
    audio: { provider: "openai-tts", model: "tts", voice: "old" },
    subtitles: {
      mode: burnIn ? ("burn-in" as const) : ("files" as const),
      language: "en" as const,
      fontId: "default",
      fontSize: 48,
      position: "bottom" as const,
    },
  };
  deps.db
    .prepare("UPDATE projects SET config=? WHERE id=?")
    .run(JSON.stringify(config), h.projectId);
  for (const kind of stageKinds)
    deps.db
      .prepare("INSERT INTO stages(id,project_id,kind,source,state) VALUES (?,?,?,?,?)")
      .run(kind, h.projectId, kind, sourceOf(config.sources, kind), kind === "audio" ? "done" : "skipped");
  for (const [id, stageKind, role, path, bytes] of [
    ["body", "audio", "audio_body", "body.mp3", "original narration"],
    ["image-one", "images", "image", "one.png", "first image"],
    ["image-two", "images", "image", "two.png", "second image"],
  ] as const) {
    writeFileSync(join(deps.paths.projects, h.projectId, path), bytes);
    insertOutput(deps.db, {
      id,
      projectId: h.projectId,
      stageKind,
      role,
      path,
      originalFilename: null,
      bytes: bytes.length,
      durationMs: stageKind === "audio" ? durationMs : null,
      meta: stageKind === "audio" ? config.audio : {},
      createdAt: deps.clock.now().toISOString(),
    });
  }
  const adopted = await ensureBaseline(deps, h.projectId);
  if (!adopted.ok) throw new Error(JSON.stringify(adopted));
  const key = video ? "export:video" : "export:wav";
  const recipe = executionPlan(deps, adopted.view, exportCatalogue).recipes.find(
    (row) => row.key === key,
  );
  if (recipe === undefined) throw new Error("Missing export recipe");
  const work = insertInvocation(
    deps,
    adopted.view,
    recipe,
    exportCatalogue,
    { key, fingerprint: adopted.view.revision.fingerprints[key] ?? recipe.logicalFingerprint },
    false,
  );
  const piece = workPieces(deps.db, work.workId)[0];
  if (piece === undefined) throw new Error("Missing export piece");
  const context: StageContext = {
    work,
    stage: { id: work.stageId, projectId: h.projectId, kind: work.kind, state: "running", work },
    signal: new AbortController().signal,
    maySubmit: () => true,
    emit: () => undefined,
  };
  const asset = writeAsset(
    deps,
    h.projectId,
    video ? "finished.mp4" : "finished.wav",
    Buffer.from("completed export"),
  );
  await publishResult(
    deps,
    context,
    piece,
    [
      preparedResult(deps, context, piece, video ? "video" : "audio_export", asset, 4000, {}),
      preparedText(deps, context, piece, "render_params", "render.json", "{}"),
    ],
    { totalSeconds: 4 },
    asset,
  );
  deps.db.prepare("UPDATE revision_work SET state='done' WHERE id=?").run(work.workId);
  const before = getRevisionView(deps, h.projectId, adopted.view.revision.id);
  if (before === undefined) throw new Error("Missing completed revision");
  expect(
    executionPlan(deps, before, exportCatalogue).work.find((row) => row.key === key)?.disposition,
  ).toBe("reuse");
  const save = async (edit: RevisionEdit) => {
    const saved = await saveRevision(deps, {
      projectId: h.projectId,
      baseRevisionId: before.revision.id,
      idempotencyKey: "edit",
      edit,
    });
    if (!saved.ok) throw new Error(JSON.stringify(saved));
    return { view: saved.view, plan: executionPlan(deps, saved.view, exportCatalogue) };
  };
  return { ...h, deps, key, before, save };
}

it.each([
  { durationMs: null, video: false },
  { durationMs: 4000, video: false },
  { durationMs: null, video: true },
  { durationMs: 4000, video: true },
])(
  "keeps completed unburned media when captions inspect duration $durationMs (video=$video)",
  async ({ durationMs, video }) => {
    const h = await fixture(durationMs, video);
    const after = await h.save({
      config: h.before.revision.config,
      content: {
        ...h.before.revision.content,
        subtitleCues: {
          audioFingerprint: "before-inspection",
          cues: [{ id: "one", text: "Edited caption", start: 0, end: 3 }],
        },
      },
    });
    expect(after.plan.work.find((row) => row.key === h.key)?.disposition).toBe("reuse");
    expect(after.plan.work.find((row) => row.key === "subtitles:files")?.disposition).toBe("local");
    for (const original of h.before.outputs.filter((row) => row.workKey === h.key)) {
      const retained = after.view.outputs.find((row) => row.assetId === original.assetId);
      expect(retained).toMatchObject({
        state: "ready",
        assetId: original.assetId,
        output: { id: original.output.id },
        available: true,
      });
      expect(readFileSync(join(h.deps.paths.projects, h.projectId, original.output.path))).toEqual(
        Buffer.from(original.output.role === "render_params" ? "{}" : "completed export"),
      );
    }
    expect(after.view.outputs.find((row) => row.output.role === "audio_body")).toMatchObject({
      state: "ready",
      output: { durationMs: 4000 },
    });
    expect(h.deps.db.prepare("SELECT count(*) AS n FROM attempts").get()).toEqual({ n: 0 });
  },
);

it.each([null, 4000])(
  "still rebuilds burned video for caption edits with duration %s",
  async (durationMs) => {
    const h = await fixture(durationMs, true, true);
    const after = await h.save({
      config: h.before.revision.config,
      content: {
        ...h.before.revision.content,
        subtitleCues: {
          audioFingerprint: "before-inspection",
          cues: [{ id: "one", text: "Edited caption", start: 0, end: 3 }],
        },
      },
    });
    expect(after.plan.work.find((row) => row.key === h.key)?.disposition).toBe("local");
  },
);

it.each(["voice", "model", "provider", "text", "gap", "intro", "image-order", "format"] as const)(
  "still invalidates media for changed %s",
  async (change) => {
    for (const video of change === "image-order" || change === "format" ? [true] : [false, true]) {
      const h = await fixture(4000, video);
      const { config, content } = h.before.revision;
      const after = await h.save({
        config: {
          ...config,
          ...(change === "voice" || change === "model" || change === "provider"
            ? { audio: { provider: "openai-tts", model: "tts", voice: "old", [change]: "changed" } }
            : {}),
          ...(change === "gap" ? { silenceGapSeconds: 2 } : {}),
          ...(change === "intro"
            ? {
                intro: { name: "Intro", mode: "text" as const },
                rendered: { ...config.rendered, intro: "An opening." },
              }
            : {}),
          ...(change === "format" ? { format: "9:16" as const } : {}),
        },
        content: {
          ...content,
          ...(change === "text" ? { articleMarkdown: "Changed narration." } : {}),
          ...(change === "image-order" ? { imageOrder: [...content.imageOrder].reverse() } : {}),
        },
      });
      expect(after.plan.work.find((row) => row.key === h.key)?.disposition).toBe("local");
      if (["voice", "model", "provider", "text", "intro"].includes(change))
        expect(
          after.plan.work.some((row) => row.stage === "audio" && row.disposition === "generate"),
        ).toBe(true);
    }
  },
);

it.each([false, true])(
  "invalidates completed export when narration bytes are replaced (video=%s)",
  async (video) => {
    const h = await fixture(4000, video);
    const narration = executionPlan(h.deps, h.before, exportCatalogue).recipes.find(
      (row) => row.input.kind === "tts",
    );
    if (narration?.input.kind !== "tts") throw new Error("Missing narration request");
    writeFileSync(join(h.deps.paths.staging, "replacement"), "new narration bytes");
    insertStagedFile(h.deps.db, {
      id: "replacement",
      stageKind: "audio",
      path: "replacement",
      originalFilename: "replacement.wav",
      bytes: 19,
      state: "staged",
      createdAt: h.deps.clock.now().toISOString(),
    });
    const after = await h.save({
      config: h.before.revision.config,
      content: h.before.revision.content,
      uploads: [
        {
          stagedFileId: "replacement",
          destination: { kind: "narration", key: narration.input.logicalKey },
        },
      ],
    });
    expect(after.plan.work.find((row) => row.key === h.key)?.disposition).toBe("local");
    expect(after.plan.work.find((row) => row.key === "subtitles:timing")?.disposition).toBe(
      "local",
    );
    expect(readFileSync(join(h.deps.paths.projects, h.projectId, "body.mp3"), "utf8")).toBe(
      "original narration",
    );
  },
);
