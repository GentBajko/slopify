import { expect, it } from "vitest";
import { catalogue } from "../rebuild/recipe-fixture.js";
import { planRevisionWork } from "../rebuild/recipe-work.js";
import { insertWorkPiece } from "../rebuild/work-records.js";
import { writeAsset } from "../storage/assets.js";
import { mutationFixture, publicationFor } from "./mutation.fake.js";
import { restoreRevision, saveRevision } from "./mutations.js";
import { insertAsset, insertManifestPiece, selectPieceRecord } from "./repo.js";
import { getRevisionView } from "./view.js";

it("projects every selected physical narration part across title save and restore without copying old grants", async () => {
  const h = await mutationFixture();
  try {
    const saved = await saveRevision(h.deps, {
      projectId: h.projectId,
      baseRevisionId: h.base.revision.id,
      idempotencyKey: "narration",
      edit: {
        config: {
          ...h.config,
          sources: { ...h.config.sources, audio: "generate" },
          audio: { provider: "voice", model: "tts", voice: "v1" },
        },
        content: h.base.revision.content,
      },
    });
    if (!saved.ok) throw new Error(JSON.stringify(saved));
    const split = {
      ...catalogue,
      tts: catalogue.tts.map((model) => ({ ...model, tts: { ...model.tts, maxCharacters: 4 } })),
    };
    const planned = planRevisionWork(
      saved.view.revision,
      { outputs: saved.view.outputs, pieces: [] },
      split,
      new Set(saved.view.outputs.map((row) => row.assetId)),
      { articleMarkdown: saved.view.articleMarkdown, researchNotes: null },
    );
    const parts = planned.recipes.filter((row) => row.input.kind === "tts");
    expect(parts.length).toBeGreaterThan(1);
    const logical = parts[0];
    if (logical?.input.kind !== "tts") throw new Error("Expected narration.");
    const publication = publicationFor(h.deps, saved.view, `${logical.input.logicalKey}:1`);
    h.deps.db.exec("DELETE FROM revision_work_reservations");
    h.deps.db.prepare("DELETE FROM revision_work_pieces WHERE id=?").run(publication.pieceId);
    for (const [idx, part] of parts.entries()) {
      const id = `physical-${idx}`;
      insertWorkPiece(h.deps.db, {
        id,
        workId: publication.work.workId,
        key: part.key,
        fingerprint: part.fingerprint,
        requestFingerprint: part.requestFingerprint,
        input: part.input,
        logicalFingerprint: part.logicalFingerprint,
        continuation: null,
        generationToken: null,
        state: "done",
        dispatchState: "held",
        submittedAt: "then",
      });
      const asset = writeAsset(h.deps, h.projectId, `${id}.wav`, Buffer.from(id));
      insertAsset(h.deps.db, asset);
      const recordId = h.deps.ids.next();
      insertManifestPiece(
        h.deps.db,
        saved.view.revision,
        {
          key: part.key,
          stageKind: "audio",
          assetId: asset.id,
          fingerprint: part.fingerprint,
          piece: {
            id,
            stageId: publication.work.stageId,
            kind: "chunk",
            idx: idx + 1,
            state: "done",
            payload: JSON.stringify({
              file: asset.path,
              requestFingerprint: part.requestFingerprint,
            }),
          },
        },
        recordId,
      );
      selectPieceRecord(h.deps.db, saved.view.revision.id, part.key, recordId);
    }
    h.deps.db.exec("DELETE FROM revision_work_reservations");
    const fresh = getRevisionView(h.deps, h.projectId, saved.view.revision.id);
    if (fresh === undefined) throw new Error("Missing view.");
    const titled = await saveRevision(h.deps, {
      projectId: h.projectId,
      baseRevisionId: fresh.revision.id,
      idempotencyKey: "title",
      edit: {
        config: { ...fresh.revision.config, title: "Changed" },
        content: fresh.revision.content,
      },
    });
    if (!titled.ok) throw new Error(JSON.stringify(titled));
    const expected = parts.map((_row, index) => ({ id: `physical-${index}` }));
    expect(
      h.deps.db.prepare("SELECT id FROM stage_pieces WHERE kind='chunk' ORDER BY idx").all(),
    ).toEqual(expected);
    const restored = await restoreRevision(h.deps, {
      projectId: h.projectId,
      baseRevisionId: titled.view.revision.id,
      idempotencyKey: "restore",
      targetRevisionId: fresh.revision.id,
    });
    expect(restored.ok).toBe(true);
    expect(
      h.deps.db.prepare("SELECT id FROM stage_pieces WHERE kind='chunk' ORDER BY idx").all(),
    ).toEqual(expected);
    expect(
      h.deps.db
        .prepare("SELECT 1 FROM revision_work_reservations WHERE work_id=?")
        .get(publication.work.workId),
    ).toBeUndefined();
  } finally {
    h.close();
  }
});
