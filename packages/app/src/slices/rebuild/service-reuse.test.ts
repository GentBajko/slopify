import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { saveRevision } from "../revisions/mutations.js";
import { getRevisionView } from "../revisions/view.js";
import { narrationCatalogue, narrationFixture } from "./runtime-narration.fake.js";
import { executionPlan } from "./runtime-plan.js";
import { createRebuildDeps } from "./service.fake.js";
import { previewRebuild, startRebuild } from "./service.js";

it("binds a selected reused narration part at its full timeline position", async () => {
  const h = await narrationFixture("abcdefgh");
  try {
    await h.pump();
    const before = h.view();
    const saved = await saveRevision(h.deps, {
      projectId: h.projectId,
      baseRevisionId: before.revision.id,
      idempotencyKey: "prefix",
      edit: {
        config: before.revision.config,
        content: {
          ...before.revision.content,
          articleMarkdown: "XXXXabcdefgh",
          articleEdited: true,
        },
      },
    });
    if (!saved.ok) throw new Error(JSON.stringify(saved));
    const recipe = executionPlan(h.deps, saved.view, narrationCatalogue).recipes.find(
      (row) => row.input.kind === "tts" && row.input.text === "abcd",
    );
    if (recipe === undefined) throw new Error("No reused request");
    const helper = createRebuildDeps(h.deps, narrationCatalogue);
    const p = await previewRebuild(helper.deps, {
      projectId: h.projectId,
      baseRevisionId: saved.view.revision.id,
      request: { kind: "selected", workKeys: [recipe.key] },
    });
    if (!p.ok) throw new Error(JSON.stringify(p));
    expect(p.value.work).toHaveLength(1);
    expect(p.value.work[0]?.disposition).toBe("reuse");
    const result = await startRebuild(helper.deps, {
      projectId: h.projectId,
      baseRevisionId: saved.view.revision.id,
      idempotencyKey: randomUUID(),
      previewId: p.value.id,
      acknowledgeUnknownCosts: false,
      confirmedProvidedWorkKeys: [],
    });
    expect(result.ok).toBe(true);
    const part = getRevisionView(h.deps, h.projectId, saved.view.revision.id)?.pieces.find(
      (row) => row.selected && row.key === recipe.key,
    );
    expect(part?.piece.idx).toBe(2);
    expect(helper.readinessCalls).toEqual([]);
  } finally {
    h.close();
  }
});
