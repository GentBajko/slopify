import { existsSync } from "node:fs";
import { afterEach, expect, it } from "vitest";
import { writeAsset } from "../storage/assets.js";
import { outputPath } from "../storage/layout.js";
import { mutationFixture } from "./mutation.fake.js";
import { validateAssetReferences } from "./mutation-assets.js";
import { saveRevision } from "./mutations.js";
import { insertAsset, insertManifestPiece, listRevisionHistory } from "./repo.js";

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const close of cleanups.splice(0)) close();
});

it("returns image-order field errors before narration recipes inspect missing definitions", async () => {
  const h = await mutationFixture();
  cleanups.push(h.close);
  const result = await saveRevision(h.deps, {
    projectId: h.projectId,
    baseRevisionId: h.base.revision.id,
    idempotencyKey: "missing-image",
    edit: {
      config: {
        ...h.config,
        sources: { ...h.config.sources, images: "generate" },
        images: { provider: "image", model: "model" },
      },
      content: { ...h.base.revision.content, imageOrder: ["missing"], imageDefinitions: {} },
    },
  });
  expect(result).toEqual({
    ok: false,
    reason: "invalid-edit",
    currentRevisionId: h.base.revision.id,
    fields: [
      {
        field: "content.imageOrder",
        message: "Every image must appear exactly once in the image order.",
      },
    ],
  });
  expect(listRevisionHistory(h.deps.db, h.projectId)).toHaveLength(1);
  expect(h.deps.db.prepare("SELECT count(*) AS n FROM revision_mutations").get()).toEqual({ n: 0 });
});

it("refuses a retained narration piece as whole provided audio before preparation", async () => {
  const h = await mutationFixture();
  cleanups.push(h.close);
  const asset = writeAsset(h.deps, h.projectId, "part.mp3", Buffer.from("audio"));
  insertAsset(h.deps.db, asset);
  h.deps.db
    .prepare(
      "INSERT INTO stages(id,project_id,kind,source,state) VALUES ('audio-stage',?,'audio','generate','done')",
    )
    .run(h.projectId);
  insertManifestPiece(
    h.deps.db,
    h.base.revision,
    {
      key: "audio:body:saved:1",
      stageKind: "audio",
      assetId: asset.id,
      fingerprint: "saved",
      piece: {
        id: "saved-piece",
        stageId: "audio-stage",
        kind: "chunk",
        idx: 1,
        state: "done",
        payload: JSON.stringify({ file: asset.path, text: "Saved article." }),
      },
    },
    "saved-record",
  );
  let probes = 0;
  const result = await saveRevision(
    {
      ...h.deps,
      measureAudio: async () => {
        probes++;
        return 1000;
      },
    },
    {
      projectId: h.projectId,
      baseRevisionId: h.base.revision.id,
      idempotencyKey: "provided-piece",
      edit: {
        config: { ...h.config, sources: { ...h.config.sources, audio: "provide" } },
        content: {
          ...h.base.revision.content,
          provided: { ...h.base.revision.content.provided, audio: asset.id },
        },
      },
    },
  );
  expect(result).toEqual({
    ok: false,
    reason: "invalid-edit",
    currentRevisionId: h.base.revision.id,
    fields: [
      { field: "content.provided.audio", message: "Choose an asset for this content stage." },
    ],
  });
  expect(probes).toBe(0);
  expect(
    validateAssetReferences(
      h.deps,
      h.projectId,
      {
        ...h.base.revision.content,
        narrationOverrides: { "audio:body:saved": { kind: "asset", assetId: asset.id } },
      },
      [],
    ),
  ).toEqual([]);
  expect(existsSync(outputPath(h.deps.paths, h.projectId, asset.path))).toBe(true);
  expect(listRevisionHistory(h.deps.db, h.projectId)).toHaveLength(1);
  expect(h.deps.db.prepare("SELECT count(*) AS n FROM revision_mutations").get()).toEqual({ n: 0 });
});
