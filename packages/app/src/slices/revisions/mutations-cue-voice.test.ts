import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { stageKinds } from "../../kernel/pipeline.js";
import { executionPlan } from "../rebuild/runtime-plan.js";
import { insertOutput } from "../storage/repo.js";
import { ensureBaseline } from "./adopt.js";
import { saveRevision } from "./mutations.js";
import { revisionFixture } from "./revision.fake.js";
import { sourceOf } from "../admission/model.js";

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const close of cleanups.splice(0)) close();
});

async function fixture(durationMs: number | null) {
  const h = revisionFixture();
  cleanups.push(h.close);
  const deps = { ...h.deps, measureAudio: async () => 4000 };
  const config = {
    ...h.config,
    sources: { ...h.config.sources, audio: "generate" as const },
    audio: { provider: "openai-tts", model: "tts", voice: "old" },
    subtitles: {
      mode: "files" as const,
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
  const path = join(deps.paths.projects, h.projectId, "old.mp3");
  writeFileSync(path, "old voice audio");
  insertOutput(deps.db, {
    id: "old_audio",
    projectId: h.projectId,
    stageKind: "audio",
    role: "audio_body",
    path: "old.mp3",
    originalFilename: null,
    bytes: 15,
    durationMs,
    meta: config.audio,
    createdAt: deps.clock.now().toISOString(),
  });
  const base = await ensureBaseline(deps, h.projectId);
  if (!base.ok) throw new Error(JSON.stringify(base));
  return { h, deps, config, base };
}

it.each([null, 4000])(
  "refuses caption edits against a changed voice when retained duration is %s",
  async (durationMs) => {
    const { h, deps, config, base } = await fixture(durationMs);
    const identity = {
      projectId: h.projectId,
      baseRevisionId: base.view.revision.id,
      idempotencyKey: "caption-voice",
    };
    const newConfig = { ...base.view.revision.config, audio: { ...config.audio, voice: "new" } };
    const saved = await saveRevision(deps, {
      ...identity,
      edit: {
        config: newConfig,
        content: {
          ...base.view.revision.content,
          subtitleCues: {
            audioFingerprint: "old-timeline",
            cues: [{ id: "one", text: "Caption edit", start: 0, end: 3 }],
          },
        },
      },
    });
    expect(saved).toMatchObject({
      ok: false,
      reason: "invalid-edit",
      fields: [
        {
          field: "content.subtitleCues",
          message:
            "The narration changed or is not finished, so these captions no longer line up. Reload the page and edit the captions again once narration is complete.",
        },
      ],
    });
    expect(
      deps.db.prepare("SELECT revision_id FROM project_heads WHERE project_id=?").get(h.projectId),
    ).toEqual({ revision_id: base.view.revision.id });
    const changed = await saveRevision(deps, {
      ...identity,
      idempotencyKey: "voice-only",
      edit: { config: newConfig, content: base.view.revision.content },
    });
    if (!changed.ok) throw new Error(JSON.stringify(changed));
    const audio = changed.view.outputs.find((row) => row.output.role === "audio_body");
    expect(audio).toMatchObject({
      state: "outdated",
      output: { durationMs, meta: { voice: "old" } },
    });
    const plan = executionPlan(deps, changed.view, {
      schemaVersion: 1,
      updatedAt: "2026-09-12",
      providers: {},
      llm: [],
      image: [],
      tts: [],
    });
    expect(
      plan.work
        .filter((row) => row.stage === "audio")
        .some((row) => row.disposition === "generate"),
    ).toBe(true);
    expect(deps.db.prepare("SELECT count(*) AS n FROM attempts").get()).toEqual({ n: 0 });
  },
);

it("enriches unchanged generated narration without making its edited captions stale", async () => {
  const { h, deps, base } = await fixture(null);
  const original = base.view.outputs.find((row) => row.output.role === "audio_body");
  const saved = await saveRevision(deps, {
    projectId: h.projectId,
    baseRevisionId: base.view.revision.id,
    idempotencyKey: "captions-only",
    edit: {
      config: base.view.revision.config,
      content: {
        ...base.view.revision.content,
        subtitleCues: {
          audioFingerprint: "unmeasured",
          cues: [{ id: "one", text: "Caption edit", start: 0, end: 3 }],
        },
      },
    },
  });
  if (!saved.ok) throw new Error(JSON.stringify(saved));
  const audio = saved.view.outputs.find((row) => row.output.role === "audio_body");
  expect(audio).toMatchObject({
    assetId: original?.assetId,
    state: "ready",
    output: { durationMs: 4000, meta: { voice: "old" } },
  });
  const plan = executionPlan(deps, saved.view, {
    schemaVersion: 1,
    updatedAt: "2026-09-12",
    providers: {},
    llm: [],
    image: [],
    tts: [],
  });
  expect(
    plan.work.filter((row) => row.stage === "audio").every((row) => row.disposition === "reuse"),
  ).toBe(true);
  expect(plan.work.find((row) => row.key === "subtitles:cues")?.disposition).toBe("local");
  expect(saved.view.revision.content.subtitleCues?.audioFingerprint).toBe(
    plan.recipes.find((row) => row.key === "subtitles:timing")?.logicalFingerprint,
  );
  expect(
    deps.db
      .prepare(
        "SELECT json_extract(descriptor,'$.durationMs') AS duration FROM revision_outputs WHERE id=?",
      )
      .get(original?.recordId ?? ""),
  ).toEqual({ duration: null });
});
