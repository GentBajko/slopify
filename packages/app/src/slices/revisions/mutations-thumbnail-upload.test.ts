import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import type { RunConfig } from "../admission/model.js";
import { insertStagedFile } from "../storage/repo.js";
import type { RevisionDeps, RevisionView } from "./model.js";
import { mutationFixture } from "./mutation.fake.js";
import { saveRevision } from "./mutations.js";
import { getRevisionView } from "./view.js";

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const close of cleanups.splice(0)) close();
});

// A project that draws three thumbnails for YouTube's Test & compare.
async function fixture() {
  const h = await mutationFixture();
  cleanups.push(h.close);
  const config: RunConfig = {
    ...h.config,
    sources: { ...h.config.sources, thumbnail: "from_prompt" },
    thumbnailCount: 3,
    images: { provider: "image", model: "v1" },
    rendered: { thumbnailPrompt: "A lighthouse at dusk" },
  };
  const drawn = await saveRevision(h.deps, {
    projectId: h.projectId,
    baseRevisionId: h.base.revision.id,
    idempotencyKey: "three",
    edit: { config, content: h.base.revision.content },
  });
  if (!drawn.ok) throw new Error(JSON.stringify(drawn));
  return { ...h, base: drawn.view };
}

function stage(deps: RevisionDeps, id: string): void {
  writeFileSync(join(deps.paths.staging, id), "picture");
  insertStagedFile(deps.db, {
    id,
    stageKind: "thumbnail",
    path: id,
    originalFilename: `${id}.png`,
    bytes: 7,
    state: "staged",
    createdAt: deps.clock.now().toISOString(),
  });
}

function thumbnails(view: RevisionView) {
  return view.outputs.filter((row) => row.selected && row.output.role === "thumbnail");
}

it("replaces one drawn thumbnail with the person's file as a new version", async () => {
  const h = await fixture();
  stage(h.deps, "mine");
  const saved = await saveRevision(h.deps, {
    projectId: h.projectId,
    baseRevisionId: h.base.revision.id,
    idempotencyKey: "replace-2",
    edit: {
      config: h.base.revision.config,
      content: h.base.revision.content,
      uploads: [{ stagedFileId: "mine", destination: { kind: "thumbnail", variant: 2 } }],
    },
  });
  if (!saved.ok) throw new Error(JSON.stringify(saved));
  const assetId = saved.view.revision.content.thumbnailOverrides?.["2"];
  expect(assetId).toEqual(expect.any(String));
  expect(thumbnails(saved.view)).toEqual([
    expect.objectContaining({
      workKey: "thumbnail:image:2",
      slot: "thumbnail:image:2",
      assetId,
      state: "ready",
      output: expect.objectContaining({ meta: { index: 2 } }),
    }),
  ]);
  // Its recipe now uses the file, which is already up to date: nothing is drawn for it.
  expect(thumbnails(saved.view)[0]?.fingerprint).toBe(
    saved.view.revision.fingerprints["thumbnail:image:2"],
  );
  // The version before keeps its own thumbnails, in History.
  const before = getRevisionView(h.deps, h.projectId, h.base.revision.id);
  expect(before?.revision.content.thumbnailOverrides).toBeUndefined();

  // Regenerate on that thumbnail draws it again instead of keeping the file.
  const remade = await saveRevision(h.deps, {
    projectId: h.projectId,
    baseRevisionId: saved.view.revision.id,
    idempotencyKey: "remake-2",
    edit: {
      config: saved.view.revision.config,
      content: saved.view.revision.content,
      regenerate: ["thumbnail:image:2"],
    },
  });
  if (!remade.ok) throw new Error(JSON.stringify(remade));
  expect(remade.view.revision.content.thumbnailOverrides).toBeUndefined();
});

it("refuses a file for a thumbnail the project does not draw", async () => {
  const h = await fixture();
  stage(h.deps, "mine");
  const refused = await saveRevision(h.deps, {
    projectId: h.projectId,
    baseRevisionId: h.base.revision.id,
    idempotencyKey: "one-only",
    edit: {
      config: { ...h.base.revision.config, thumbnailCount: 1 },
      content: h.base.revision.content,
      uploads: [{ stagedFileId: "mine", destination: { kind: "thumbnail", variant: 3 } }],
    },
  });
  expect(refused).toMatchObject({
    ok: false,
    reason: "invalid-edit",
    fields: [expect.objectContaining({ field: "uploads.0" })],
  });
});
