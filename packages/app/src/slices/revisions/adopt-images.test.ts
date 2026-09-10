import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { afterEach, expect, it } from "vitest";
import { insertPiece } from "../../kernel/runner/piece-repo.js";
import type { RunConfig } from "../admission/model.js";
import { updateProjectConfig } from "../admission/repo.js";
import { outputPath } from "../storage/layout.js";
import { insertOutput } from "../storage/repo.js";
import { ensureBaseline } from "./adopt.js";
import { revisionFixture } from "./revision.fake.js";

const fixtures: ReturnType<typeof revisionFixture>[] = [];
afterEach(() => {
  for (const h of fixtures.splice(0)) h.close();
});
function setup(
  source: RunConfig["sources"]["images"] = "generate",
): ReturnType<typeof revisionFixture> {
  const h = revisionFixture();
  fixtures.push(h);
  updateProjectConfig(
    h.deps.db,
    h.projectId,
    {
      ...h.config,
      sources: { ...h.config.sources, images: source },
      images: { provider: "image", model: "v1" },
      imagePrompts: [
        { name: "one", number: 3 },
        { name: "two", number: 1 },
      ],
      rendered: { "imagePrompts.0": "A {literal} orchard", "imagePrompts.1": "A lake" },
      provided: { ...h.config.provided, images: ["consumed-staging"] },
    },
    h.deps.clock.now().toISOString(),
  );
  h.deps.db
    .prepare("INSERT INTO stages(id,project_id,kind,source,state) VALUES (?,?,?,?,?)")
    .run("images", h.projectId, "images", source, "failed");
  return h;
}
function image(
  h: ReturnType<typeof revisionFixture>,
  id: string,
  idx: number,
  prompt = "A {literal} orchard",
  exists = true,
): string {
  const path = `images/${id}.png`;
  insertOutput(h.deps.db, {
    id,
    projectId: h.projectId,
    stageKind: "images",
    role: "image",
    path,
    originalFilename: null,
    bytes: 5,
    durationMs: null,
    meta: { index: idx, prompt },
    createdAt: h.deps.clock.now().toISOString(),
  });
  if (exists) {
    const target = outputPath(h.deps.paths, h.projectId, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, "image");
  }
  return path;
}
function piece(
  h: ReturnType<typeof revisionFixture>,
  id: string,
  idx: number,
  file?: string,
  promptIndex = 1,
): void {
  insertPiece(h.deps.db, {
    id,
    stageId: "images",
    kind: "image",
    idx,
    state: file === undefined ? "pending" : "done",
    payload: JSON.stringify({
      prompt: "A {literal} orchard",
      promptIndex,
      ...(file === undefined ? {} : { file }),
    }),
  });
}
it("keeps slideshow order across reverse completion and a pending middle image", async () => {
  const h = setup();
  const third = image(h, "out3", 3);
  const first = image(h, "out1", 1);
  piece(h, "piece1", 1, first);
  piece(h, "piece2", 2);
  piece(h, "piece3", 3, third);
  const result = await ensureBaseline(h.deps, h.projectId);
  if (!result.ok) throw new Error("Expected baseline.");
  expect(result.view.revision.content.imageOrder).toEqual(["out1", "piece2", "out3"]);
  expect(Object.keys(result.view.revision.content.imageDefinitions)).toHaveLength(3);
  expect(result.view.pieces.map((row) => row.key).sort()).toEqual([
    "image:out1",
    "image:out3",
    "image:piece2",
  ]);
  const definition = result.view.revision.content.imageDefinitions.out1;
  expect(definition?.templateKey).toBe("imagePrompts.0");
  expect(definition?.prompt).toBe("A {literal} orchard");
  expect(result.view.outputs.find((row) => row.output.id === "out1")?.assetId).toBe(
    definition?.assetId,
  );
});
it("does not resurrect a deleted middle image from stale configured counts", async () => {
  const h = setup();
  const first = image(h, "out1", 1);
  const third = image(h, "out3", 3);
  piece(h, "piece1", 1, first);
  piece(h, "piece3", 3, third);
  const result = await ensureBaseline(h.deps, h.projectId);
  if (!result.ok) throw new Error("Expected baseline.");
  expect(result.view.revision.content.imageOrder).toEqual(["out1", "out3"]);
});
it("preserves a pending regenerated image key and does not use its slideshow index as its template index", async () => {
  const h = setup();
  piece(h, "regenerated", 3, undefined, 2);
  const result = await ensureBaseline(h.deps, h.projectId);
  if (!result.ok) throw new Error("Expected baseline.");
  expect(result.view.revision.content.imageOrder).toEqual(["regenerated"]);
  expect(result.view.revision.content.imageDefinitions.regenerated?.templateKey).toBe(
    "imagePrompts.1",
  );
});
it("adopts output-only images without inventing a link to a selected prompt", async () => {
  const h = setup();
  image(h, "out3", 3, "Recorded only");
  const result = await ensureBaseline(h.deps, h.projectId);
  if (!result.ok) throw new Error("Expected baseline.");
  expect(result.view.revision.content.imageOrder).toEqual(["out3"]);
  expect(result.view.revision.content.imageDefinitions.out3).toMatchObject({
    prompt: "Recorded only",
    templateKey: null,
  });
});
it("keeps one definition and shared asset when a crash stored the output before the piece file", async () => {
  const h = setup();
  image(h, "early", 1);
  piece(h, "unfinished", 1);
  const result = await ensureBaseline(h.deps, h.projectId);
  if (!result.ok) throw new Error("Expected baseline.");
  expect(result.view.revision.content.imageOrder).toEqual(["early"]);
  expect(result.view.pieces[0]?.key).toBe("image:early");
  expect(result.view.pieces[0]?.assetId).toBe(result.view.outputs[0]?.assetId);
});
it("refuses ambiguous crash ownership without adopting any assets or head", async () => {
  const h = setup();
  image(h, "early1", 1);
  image(h, "early2", 1);
  piece(h, "unfinished", 1);
  await expect(ensureBaseline(h.deps, h.projectId)).rejects.toThrow("multiple outputs");
  expect(h.deps.db.prepare("SELECT * FROM project_heads").all()).toEqual([]);
  expect(h.deps.db.prepare("SELECT * FROM project_assets").all()).toEqual([]);
});
it("retains the asset reference for a completed image whose file is externally missing", async () => {
  const h = setup();
  const file = image(h, "gone", 1, "A {literal} orchard", false);
  piece(h, "done", 1, file);
  const result = await ensureBaseline(h.deps, h.projectId);
  if (!result.ok) throw new Error("Expected baseline.");
  expect(result.view.revision.content.imageDefinitions.gone?.assetId).not.toBeNull();
  expect(result.view.outputs[0]?.available).toBe(false);
  expect(result.view.pieces[0]?.available).toBe(false);
});
it("expands a truly unplanned generated image selection once in selection order", async () => {
  const h = setup();
  const result = await ensureBaseline(h.deps, h.projectId);
  if (!result.ok) throw new Error("Expected baseline.");
  const content = result.view.revision.content;
  expect(content.imageOrder).toHaveLength(4);
  expect(content.imageOrder.map((key) => content.imageDefinitions[key]?.prompt)).toEqual([
    "A {literal} orchard",
    "A {literal} orchard",
    "A {literal} orchard",
    "A lake",
  ]);
  const again = await ensureBaseline(h.deps, h.projectId);
  expect(again.ok && again.view.revision.content.imageOrder).toEqual(content.imageOrder);
});
it.each(["provide", "off"] as const)(
  "does not expand stale prompt selections when Images is %s",
  async (source) => {
    const h = setup(source);
    image(h, "owned", 1);
    const result = await ensureBaseline(h.deps, h.projectId);
    if (!result.ok) throw new Error("Expected baseline.");
    expect(result.view.revision.content.imageOrder).toEqual(["owned"]);
    expect(result.view.revision.content.imageDefinitions.owned?.assetId).toBe(
      result.view.outputs[0]?.assetId,
    );
    expect(result.view.revision.content.imageDefinitions.owned?.assetId).not.toBe(
      "consumed-staging",
    );
    if (source === "provide")
      expect(result.view.revision.content.imageDefinitions.owned?.source).toBe("provide");
  },
);
it("preserves a malformed image piece without inventing a runnable prompt", async () => {
  const h = setup();
  insertPiece(h.deps.db, {
    id: "broken",
    stageId: "images",
    kind: "image",
    idx: 1,
    state: "failed",
    payload: "{broken",
  });
  const result = await ensureBaseline(h.deps, h.projectId);
  if (!result.ok) throw new Error("Expected baseline.");
  expect(result.view.pieces[0]?.piece.payload).toBe("{broken");
  expect(result.view.revision.content.imageDefinitions.broken?.prompt).toBeNull();
});
it("keeps an uploaded dormant image as supplied when Images is off", async () => {
  const h = setup("off");
  image(h, "uploaded", 1);
  h.deps.db
    .prepare("UPDATE outputs SET original_filename=?,meta=? WHERE id=?")
    .run("family.png", JSON.stringify({ index: 1 }), "uploaded");
  const result = await ensureBaseline(h.deps, h.projectId);
  if (!result.ok) throw new Error("Expected baseline.");
  expect(result.view.revision.content.imageDefinitions.uploaded).toMatchObject({
    source: "provide",
    prompt: null,
    templateKey: null,
  });
});
