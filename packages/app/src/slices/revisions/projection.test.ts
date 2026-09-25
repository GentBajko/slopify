import { afterEach, expect, it } from "vitest";
import { z } from "zod";
import { insertManifestPiece, selectPieceRecord } from "./manifest-repo.js";
import type { ManifestPiece } from "./model.js";
import { mutationFixture } from "./mutation.fake.js";
import { ensureRevisionStages, projectSelected } from "./projection.js";

const closes: (() => void)[] = [];
afterEach(() => {
  for (const close of closes.splice(0)) close();
});

// A narration rewrite gives body preparation new keys. The pieces for the old keys stay
// selected in the revision while the new ones are published into the same positions, and the
// legacy projection used to insert both and fail the whole publication on its unique index.
it("projects the newest of two selected pieces that claim one stage position", async () => {
  const h = await mutationFixture();
  closes.push(h.close);
  ensureRevisionStages(h.deps, h.base.revision);
  const stageId = z
    .object({ id: z.string() })
    .parse(
      h.deps.db
        .prepare("SELECT id FROM stages WHERE project_id=? AND kind='audio'")
        .get(h.projectId),
    ).id;
  const piece = (key: string, text: string): ManifestPiece => ({
    key,
    stageKind: "audio",
    assetId: null,
    fingerprint: key,
    piece: {
      id: h.deps.ids.next(),
      stageId,
      kind: "prompt_written",
      idx: 3,
      state: "done",
      payload: JSON.stringify({ text }),
    },
  });
  const older = piece("narration:prepare:body:old", "prepared with escapes");
  const newer = piece("narration:prepare:body:new", "prepared plain");
  for (const row of [older, newer]) {
    const recordId = h.deps.ids.next();
    insertManifestPiece(h.deps.db, h.base.revision, row, recordId);
    selectPieceRecord(h.deps.db, h.base.revision.id, row.key, recordId);
  }
  const revision = {
    ...h.base.revision,
    fingerprints: { ...h.base.revision.fingerprints, [older.key]: "old", [newer.key]: "new" },
  };

  expect(() => projectSelected(h.deps.db, revision)).not.toThrow();

  const projected = h.deps.db
    .prepare("SELECT id FROM stage_pieces WHERE stage_id=? AND kind='prompt_written' AND idx=3")
    .all(stageId);
  expect(projected).toEqual([{ id: newer.piece.id }]);
});
