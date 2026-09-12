import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import type { RunConfig } from "../admission/model.js";
import { executionPlan } from "../rebuild/runtime-plan.js";
import { createRebuildDeps } from "../rebuild/service.fake.js";
import { previewRebuild, startRebuild } from "../rebuild/service.js";
import { writeAsset } from "../storage/assets.js";
import { insertOutput, insertStagedFile } from "../storage/repo.js";
import { ensureBaseline } from "./adopt.js";
import { findRevisionDownload } from "./downloads.js";
import { saveRevision } from "./mutations.js";
import { insertAsset, insertManifestPiece } from "./repo.js";
import { revisionFixture } from "./revision.fake.js";
import { getRevisionView } from "./view.js";

const fixtures: ReturnType<typeof revisionFixture>[] = [];
afterEach(() => {
  for (const h of fixtures.splice(0)) h.close();
});

async function fixture(pieceOnly = false) {
  const h = revisionFixture();
  fixtures.push(h);
  const config: RunConfig = {
    ...h.config,
    sources: { ...h.config.sources, images: "provide" },
    provided: { ...h.config.provided, images: ["consumed-staging"] },
  };
  h.deps.db
    .prepare("UPDATE projects SET config=? WHERE id=?")
    .run(JSON.stringify(config), h.projectId);
  for (const [index, id] of ["first", "second"].entries()) {
    const path = `${id}.png`;
    writeFileSync(join(h.deps.paths.projects, h.projectId, path), id);
    insertOutput(h.deps.db, {
      id,
      projectId: h.projectId,
      stageKind: "images",
      role: "image",
      path,
      originalFilename: `original-${id}.png`,
      bytes: Buffer.byteLength(id),
      durationMs: null,
      meta: { index: index + 1, prompt: `Retained ${id}`, provider: "old", model: "old-image" },
      createdAt: h.deps.clock.now().toISOString(),
    });
  }
  writeFileSync(join(h.deps.paths.projects, h.projectId, "article.md"), "Saved article.");
  insertOutput(h.deps.db, {
    id: "article",
    projectId: h.projectId,
    stageKind: "article",
    role: "article_md",
    path: "article.md",
    originalFilename: null,
    bytes: 14,
    durationMs: null,
    meta: {},
    createdAt: h.deps.clock.now().toISOString(),
  });
  const baseline = await ensureBaseline(h.deps, h.projectId);
  if (!baseline.ok) throw new Error(JSON.stringify(baseline));
  let assetId = baseline.view.revision.content.imageDefinitions.first?.assetId;
  if (pieceOnly) {
    const asset = writeAsset(h.deps, h.projectId, "piece.png", Buffer.from("piece"));
    insertAsset(h.deps.db, asset);
    insertManifestPiece(
      h.deps.db,
      baseline.view.revision,
      {
        key: "image:piece",
        stageKind: "images",
        assetId: asset.id,
        fingerprint: "retained",
        piece: {
          id: "piece",
          stageId: "unused-history-stage",
          kind: "image",
          idx: 3,
          state: "done",
          payload: JSON.stringify({ file: asset.path, prompt: "Piece prompt" }),
        },
      },
      "retained-piece",
    );
    assetId = asset.id;
  }
  if (assetId == null) throw new Error("Missing retained image asset.");
  const base = getRevisionView(h.deps, h.projectId, baseline.view.revision.id);
  if (base === undefined) throw new Error("Missing baseline.");
  return { ...h, config, base, assetId };
}

it.each(["same-key", "move", "replace", "append", "piece-only"] as const)(
  "binds a retained image to every requested destination: %s",
  async (mode) => {
    const h = await fixture(mode === "piece-only");
    const key = mode === "same-key" ? "first" : mode === "replace" ? "second" : "new-key";
    const imageOrder = mode === "append" ? ["first", key] : [key];
    const originalAssets = h.deps.db.prepare("SELECT * FROM project_assets ORDER BY id").all();
    const projectPath = join(h.deps.paths.projects, h.projectId);
    const originalFiles = readdirSync(projectPath, { recursive: true });
    const source = h.base.outputs.find((row) => row.assetId === h.assetId);
    const saved = await saveRevision(h.deps, {
      projectId: h.projectId,
      baseRevisionId: h.base.revision.id,
      idempotencyKey: mode,
      edit: {
        config: h.config,
        content: {
          ...h.base.revision.content,
          imageOrder,
          imageDefinitions: Object.fromEntries(
            imageOrder.map((id) => [
              id,
              {
                source: "provide" as const,
                assetId: h.assetId,
                prompt: null,
              },
            ]),
          ),
        },
      },
    });
    if (!saved.ok) throw new Error(JSON.stringify(saved));
    const images = saved.view.outputs.filter((row) => row.selected && row.output.role === "image");
    expect(images).toHaveLength(imageOrder.length);
    expect(new Set(images.map((row) => row.slot)).size).toBe(imageOrder.length);
    expect(new Set(images.map((row) => row.output.id)).size).toBe(imageOrder.length);
    for (const [index, imageKey] of imageOrder.entries()) {
      const row = images.find((one) => one.workKey === `image:${imageKey}`);
      expect(row).toMatchObject({
        slot: `image:${imageKey}`,
        assetId: h.assetId,
        state: "ready",
        available: true,
        output: {
          stageKind: "images",
          role: "image",
          meta: { index: index + 1 },
        },
      });
      if (row === undefined) throw new Error("Missing destination image.");
      if (source !== undefined) {
        expect(row.output).toEqual({
          ...source.output,
          id: expect.any(String),
          meta: { ...source.output.meta, index: index + 1 },
        });
      }
      const download = findRevisionDownload(
        h.deps,
        h.projectId,
        saved.view.revision.id,
        row.recordId,
      );
      if (!download.ok) throw new Error(JSON.stringify(download));
      expect(readFileSync(download.download.path, "utf8")).toBe(
        mode === "piece-only" ? "piece" : "first",
      );
    }
    const rebuild = createRebuildDeps(h.deps);
    expect(
      executionPlan(h.deps, saved.view, rebuild.deps.catalogue.read())
        .work.filter((row) => row.stage === "images")
        .map((row) => row.disposition),
    ).toEqual(imageOrder.map(() => "reuse"));
    const preview = await previewRebuild(rebuild.deps, {
      projectId: h.projectId,
      baseRevisionId: saved.view.revision.id,
      request: { kind: "allAffected" },
    });
    if (!preview.ok) throw new Error(JSON.stringify(preview));
    expect(preview.value.work).toEqual([]);
    const start = await startRebuild(rebuild.deps, {
      projectId: h.projectId,
      baseRevisionId: saved.view.revision.id,
      idempotencyKey: "10000000-0000-4000-8000-000000000001",
      previewId: preview.value.id,
      acknowledgeUnknownCosts: true,
      confirmedProvidedWorkKeys: preview.value.providedReuseRequired,
    });
    expect(start).toMatchObject({ ok: true, value: { workIds: [] } });
    expect(getRevisionView(h.deps, h.projectId, h.base.revision.id)).toEqual({
      ...h.base,
      current: false,
    });
    expect(h.deps.db.prepare("SELECT * FROM project_assets ORDER BY id").all()).toEqual(
      originalAssets,
    );
    expect(readdirSync(projectPath, { recursive: true })).toEqual(originalFiles);
  },
);

it("combines retained bindings and a staged upload without copying retained bytes or duplicating destinations", async () => {
  const h = await fixture();
  const originalAssets = h.deps.db.prepare("SELECT * FROM project_assets ORDER BY id").all();
  writeFileSync(join(h.deps.paths.staging, "upload"), "new-image");
  insertStagedFile(h.deps.db, {
    id: "upload",
    stageKind: "images",
    path: "upload",
    originalFilename: "uploaded.png",
    bytes: 9,
    state: "staged",
    createdAt: h.deps.clock.now().toISOString(),
  });
  const request = {
    projectId: h.projectId,
    baseRevisionId: h.base.revision.id,
    idempotencyKey: "mixed-import",
    edit: {
      config: h.config,
      content: {
        ...h.base.revision.content,
        imageOrder: ["retained", "uploaded"],
        imageDefinitions: {
          retained: { source: "provide" as const, assetId: h.assetId, prompt: null },
          uploaded: { source: "provide" as const, assetId: null, prompt: null },
        },
      },
      uploads: [
        { stagedFileId: "upload", destination: { kind: "image" as const, imageKey: "uploaded" } },
      ],
    },
  };
  const saved = await saveRevision(h.deps, request);
  if (!saved.ok) throw new Error(JSON.stringify(saved));
  const images = saved.view.outputs.filter((row) => row.selected && row.output.role === "image");
  expect(images).toHaveLength(2);
  expect(images.find((row) => row.workKey === "image:retained")).toMatchObject({
    assetId: h.assetId,
    state: "ready",
  });
  const uploaded = images.find((row) => row.workKey === "image:uploaded");
  expect(uploaded).toMatchObject({
    state: "ready",
    output: { originalFilename: "uploaded.png", meta: { index: 2 } },
  });
  if (uploaded === undefined) throw new Error("Missing uploaded image.");
  expect(readFileSync(join(h.deps.paths.projects, h.projectId, uploaded.output.path), "utf8")).toBe(
    "new-image",
  );
  const assets = h.deps.db.prepare("SELECT * FROM project_assets ORDER BY id").all();
  expect(assets).toHaveLength(originalAssets.length + 1);
  expect(assets).toEqual(expect.arrayContaining(originalAssets));
  expect(await saveRevision(h.deps, request)).toMatchObject({ ok: true, duplicate: true });
  expect(h.deps.db.prepare("SELECT * FROM project_assets ORDER BY id").all()).toEqual(assets);
});
