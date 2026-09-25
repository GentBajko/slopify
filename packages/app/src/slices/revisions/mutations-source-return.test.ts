import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import type { StageContext } from "../../kernel/runner/index.js";
import type { RunConfig } from "../admission/model.js";
import { insertInvocation } from "../rebuild/runtime-admission.js";
import { executionPlan } from "../rebuild/runtime-plan.js";
import { preparedResult, publishResult } from "../rebuild/runtime-publication.js";
import { createRebuildDeps } from "../rebuild/service.fake.js";
import { previewRebuild } from "../rebuild/service.js";
import { workPieces } from "../rebuild/work-records.js";
import { writeAsset } from "../storage/assets.js";
import { insertOutput } from "../storage/repo.js";
import { ensureBaseline } from "./adopt.js";
import { saveRevision } from "./mutations.js";
import { revisionFixture } from "./revision.fake.js";
import { getRevisionView } from "./view.js";

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const close of cleanups.splice(0)) close();
});

async function fixture(kind: "audio" | "thumbnail") {
  const h = revisionFixture();
  cleanups.push(h.close);
  let inspections = 0;
  const deps = {
    ...h.deps,
    measureAudio: async () => {
      inspections++;
      return 4000;
    },
  };
  const role = kind === "audio" ? "audio_body" : "thumbnail";
  const key = kind === "audio" ? "audio:provided" : "thumbnail:image";
  const config: RunConfig = {
    ...h.config,
    sources: { ...h.config.sources, [kind]: "provide" },
    audio: { provider: "openai-tts", model: "tts", voice: "old" },
    images: { provider: "image", model: "image" },
    rendered: { thumbnailPrompt: "New thumbnail" },
  };
  deps.db
    .prepare("UPDATE projects SET config=? WHERE id=?")
    .run(JSON.stringify(config), h.projectId);
  const path = join(deps.paths.projects, h.projectId, "original.media");
  writeFileSync(path, "ORIGINAL");
  insertOutput(deps.db, {
    id: "original",
    projectId: h.projectId,
    stageKind: kind,
    role,
    path: "original.media",
    originalFilename: "supplied.media",
    bytes: 8,
    durationMs: kind === "audio" ? 4000 : null,
    meta: {},
    createdAt: deps.clock.now().toISOString(),
  });
  const base = await ensureBaseline(deps, h.projectId);
  if (!base.ok) throw new Error(JSON.stringify(base));
  const original = base.view.outputs.find((row) => row.output.role === role);
  if (original === undefined) throw new Error("Missing original media.");
  const saved = await saveRevision(deps, {
    projectId: h.projectId,
    baseRevisionId: base.view.revision.id,
    idempotencyKey: "generate",
    edit: {
      config: {
        ...config,
        sources: { ...config.sources, [kind]: kind === "audio" ? "generate" : "from_prompt" },
      },
      content: base.view.revision.content,
    },
  });
  if (!saved.ok) throw new Error(JSON.stringify(saved));
  const rebuild = createRebuildDeps(deps);
  const catalogue = rebuild.deps.catalogue.read();
  const recipe = executionPlan(deps, saved.view, catalogue).recipes.find(
    (row) => row.key === (kind === "audio" ? "audio:body:concat" : key),
  );
  if (recipe === undefined) throw new Error("Missing generated recipe.");
  deps.db
    .prepare("DELETE FROM revision_work_reservations WHERE revision_id=? AND work_key=?")
    .run(saved.view.revision.id, recipe.key);
  const work = insertInvocation(
    deps,
    saved.view,
    recipe,
    catalogue,
    {
      key: recipe.key,
      fingerprint: saved.view.revision.fingerprints[recipe.key] ?? recipe.logicalFingerprint,
    },
    false,
  );
  const piece = workPieces(deps.db, work.workId)[0];
  if (piece === undefined) throw new Error("Missing generated piece.");
  const context: StageContext = {
    work,
    stage: { id: work.stageId, projectId: h.projectId, kind, state: "running", work },
    signal: new AbortController().signal,
    maySubmit: () => true,
    emit: () => undefined,
  };
  const generated = writeAsset(deps, h.projectId, "generated.media", Buffer.from("GENERATED"));
  await publishResult(
    deps,
    context,
    piece,
    [preparedResult(deps, context, piece, role, generated, kind === "audio" ? 4000 : null)],
    {},
    generated,
  );
  deps.db.prepare("UPDATE revision_work SET state='done' WHERE id=?").run(work.workId);
  const current = getRevisionView(deps, h.projectId, saved.view.revision.id);
  if (current === undefined) throw new Error("Missing generated revision.");
  expect(current.outputs.find((row) => row.selected && row.output.role === role)?.assetId).toBe(
    generated.id,
  );
  const request = {
    projectId: h.projectId,
    baseRevisionId: current.revision.id,
    idempotencyKey: "provide-again",
    edit: {
      config: {
        ...current.revision.config,
        sources: { ...current.revision.config.sources, [kind]: "provide" as const },
      },
      content: current.revision.content,
    },
  };
  return {
    ...h,
    deps,
    rebuild,
    catalogue,
    role,
    key,
    path,
    original,
    generated,
    current,
    request,
    inspections: () => inspections,
  };
}

it.each(["audio", "thumbnail"] as const)(
  "reactivates retained %s after generated media without losing history",
  async (kind) => {
    const h = await fixture(kind);
    const assets = h.deps.db.prepare("SELECT * FROM project_assets ORDER BY id").all();
    const result = await saveRevision(h.deps, h.request);
    if (!result.ok) throw new Error(JSON.stringify(result));
    const selected = result.view.outputs.filter(
      (row) => row.selected && row.output.role === h.role,
    );
    expect(selected).toHaveLength(1);
    expect(selected[0]).toMatchObject({
      workKey: h.key,
      assetId: h.original.assetId,
      state: "ready",
      available: true,
    });
    expect(
      executionPlan(h.deps, result.view, h.catalogue).work.find((row) => row.key === h.key)
        ?.disposition,
    ).toBe("reuse");
    const preview = await previewRebuild(h.rebuild.deps, {
      projectId: h.projectId,
      baseRevisionId: result.view.revision.id,
      request: { kind: "allAffected" },
    });
    expect(preview).toMatchObject({ ok: true });
    expect(getRevisionView(h.deps, h.projectId, h.current.revision.id)).toEqual({
      ...h.current,
      current: false,
    });
    expect(h.deps.db.prepare("SELECT * FROM project_assets ORDER BY id").all()).toEqual(assets);
    expect(readFileSync(h.path, "utf8")).toBe("ORIGINAL");
    expect(readFileSync(join(h.deps.paths.projects, h.projectId, h.generated.path), "utf8")).toBe(
      "GENERATED",
    );
    expect(await saveRevision(h.deps, h.request)).toMatchObject({ ok: true, duplicate: true });
    expect(h.deps.db.prepare("SELECT count(*) AS n FROM attempts").get()).toEqual({ n: 0 });
  },
);

it.each(["audio", "thumbnail"] as const)(
  "refuses missing dormant %s before inspection and leaves the head intact",
  async (kind) => {
    const h = await fixture(kind);
    rmSync(h.path);
    const inspections = h.inspections();
    const result = await saveRevision(h.deps, h.request);
    expect(result).toMatchObject({
      ok: false,
      reason: "invalid-edit",
      fields: [
        expect.objectContaining({ message: "The replacement file is missing. Upload it again." }),
      ],
    });
    expect(h.inspections()).toBe(inspections);
    expect(getRevisionView(h.deps, h.projectId, h.current.revision.id)?.current).toBe(true);
  },
);

it.each(["audio", "thumbnail"] as const)(
  "does not reactivate dormant %s on an unrelated Save",
  async (kind) => {
    const h = await fixture(kind);
    rmSync(h.path);
    const result = await saveRevision(h.deps, {
      ...h.request,
      edit: { ...h.request.edit, config: { ...h.current.revision.config, title: "New title" } },
    });
    if (!result.ok) throw new Error(JSON.stringify(result));
    expect(
      result.view.outputs.find((row) => row.selected && row.output.role === h.role)?.assetId,
    ).toBe(h.generated.id);
    expect(h.inspections()).toBe(0);
  },
);

it.each(["audio", "thumbnail"] as const)(
  "keeps generated %s selected when changing an inactive provided reference",
  async (kind) => {
    const h = await fixture(kind);
    const selected = h.current.outputs.find((row) => row.selected && row.output.role === h.role);
    const result = await saveRevision(h.deps, {
      ...h.request,
      edit: {
        config: h.current.revision.config,
        content: {
          ...h.current.revision.content,
          provided: { ...h.current.revision.content.provided, [kind]: h.generated.id },
        },
      },
    });
    if (!result.ok) throw new Error(JSON.stringify(result));
    expect(
      result.view.outputs.find((row) => row.selected && row.output.role === h.role)?.output,
    ).toEqual(selected?.output);
    expect(h.inspections()).toBe(0);
  },
);

it.each(["audio", "thumbnail"] as const)(
  "allows unrelated edits when selected provided %s has gone missing",
  async (kind) => {
    const h = await fixture(kind);
    const restored = await saveRevision(h.deps, h.request);
    if (!restored.ok) throw new Error(JSON.stringify(restored));
    rmSync(h.path);
    const inspections = h.inspections();
    const result = await saveRevision(h.deps, {
      ...h.request,
      baseRevisionId: restored.view.revision.id,
      idempotencyKey: "missing-title",
      edit: {
        config: { ...restored.view.revision.config, title: "New title" },
        content: restored.view.revision.content,
      },
    });
    if (!result.ok) throw new Error(JSON.stringify(result));
    expect(
      result.view.outputs.find((row) => row.selected && row.output.role === h.role),
    ).toMatchObject({ assetId: h.original.assetId, available: false });
    expect(h.inspections()).toBe(inspections);
  },
);
