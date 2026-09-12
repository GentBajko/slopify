import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { narrationCatalogue, narrationFixture } from "./runtime-narration.fake.js";
import { createRebuildDeps } from "./service.fake.js";
import { previewRebuild, startRebuild } from "./service.js";

it.each(["accepted-operation", ""])(
  "retrieves an accepted operation with its original physical input despite a disabled model (%s)",
  async (continuation) => {
    const h = await narrationFixture("The original narration text.");
    try {
      const view = h.view();
      const before = h.deps.db
        .prepare(
          "SELECT p.* FROM revision_work_pieces p JOIN revision_work_reservations r ON r.piece_id=p.id WHERE json_extract(p.input_json,'$.kind')='tts' ORDER BY p.work_key",
        )
        .all();
      const first = before[0];
      if (first === undefined) throw new Error("Missing narration");
      const originalContext = h.deps.db
        .prepare("SELECT recipe_context FROM revision_work WHERE id=?")
        .get(String(first.work_id));
      h.deps.db
        .prepare(
          "UPDATE revision_work_pieces SET continuation=?,submitted_at='accepted',state='failed',dispatch_state='held' WHERE id=?",
        )
        .run(continuation, String(first.id));
      h.deps.db
        .prepare("UPDATE revision_work SET state='failed',dispatch_state='held' WHERE id=?")
        .run(String(first.work_id));
      const changed = {
        ...narrationCatalogue,
        tts: narrationCatalogue.tts.map((row) => ({
          ...row,
          enabled: false,
          tts: { ...row.tts, maxCharacters: 2 },
        })),
      };
      const helper = createRebuildDeps(h.deps, changed);
      const p = await previewRebuild(helper.deps, {
        projectId: h.projectId,
        baseRevisionId: view.revision.id,
        request: { kind: "selected", workKeys: [String(first.work_key)] },
      });
      if (!p.ok) throw new Error(JSON.stringify(p));
      expect(p.value.costs.unknown).toBe(0);
      const result = await startRebuild(helper.deps, {
        projectId: h.projectId,
        baseRevisionId: view.revision.id,
        previewId: p.value.id,
        idempotencyKey: randomUUID(),
        acknowledgeUnknownCosts: false,
        confirmedProvidedWorkKeys: [],
      });
      if (!result.ok) throw new Error(JSON.stringify(result));
      expect(result.value.workIds).toContain(first.work_id);
      expect(helper.readinessCalls).toEqual([]);
      const after = h.deps.db
        .prepare("SELECT * FROM revision_work_pieces WHERE id=?")
        .get(String(first.id));
      expect(after).toMatchObject({
        input_json: first.input_json,
        continuation,
        submitted_at: "accepted",
        dispatch_state: "allowed",
      });
      expect(
        h.deps.db
          .prepare("SELECT recipe_context FROM revision_work WHERE id=?")
          .get(String(first.work_id)),
      ).toEqual(originalContext);
      expect(h.calls).toEqual([]);
    } finally {
      h.close();
    }
  },
);
it("refuses a failed unaccepted physical request that exceeds a newly lowered limit", async () => {
  const h = await narrationFixture("The original narration text.");
  try {
    const first = h.deps.db
      .prepare(
        "SELECT p.* FROM revision_work_pieces p JOIN revision_work_reservations r ON r.piece_id=p.id WHERE json_extract(p.input_json,'$.kind')='tts' AND length(json_extract(p.input_json,'$.text'))>2 LIMIT 1",
      )
      .get();
    if (first === undefined) throw new Error("Missing narration");
    h.deps.db
      .prepare("UPDATE revision_work_pieces SET state='failed',dispatch_state='held' WHERE id=?")
      .run(String(first.id));
    h.deps.db
      .prepare("UPDATE revision_work SET state='failed',dispatch_state='held' WHERE id=?")
      .run(String(first.work_id));
    const helper = createRebuildDeps(h.deps, {
      ...narrationCatalogue,
      tts: narrationCatalogue.tts.map((row) => ({ ...row, tts: { ...row.tts, maxCharacters: 2 } })),
    });
    const p = await previewRebuild(helper.deps, {
      projectId: h.projectId,
      baseRevisionId: h.view().revision.id,
      request: { kind: "selected", workKeys: [String(first.work_key)] },
    });
    if (!p.ok) throw new Error(JSON.stringify(p));
    const result = await startRebuild(helper.deps, {
      projectId: h.projectId,
      baseRevisionId: h.view().revision.id,
      previewId: p.value.id,
      idempotencyKey: randomUUID(),
      acknowledgeUnknownCosts: true,
      confirmedProvidedWorkKeys: [],
    });
    expect(result).toMatchObject({
      ok: false,
      reason: "readiness",
      fields: expect.arrayContaining([
        expect.objectContaining({ field: `work.${first.work_key}.text` }),
      ]),
    });
    expect(
      h.deps.db
        .prepare("SELECT dispatch_state,input_json FROM revision_work_pieces WHERE id=?")
        .get(String(first.id)),
    ).toEqual({ dispatch_state: "held", input_json: first.input_json });
  } finally {
    h.close();
  }
});
