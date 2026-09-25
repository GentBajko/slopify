import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { saveRevision } from "../revisions/mutations.js";
import { getRevisionView } from "../revisions/view.js";
import { exportSnapshot } from "./runtime-export-inputs.js";
import { materializeAdmittedWork } from "./runtime-materialize.js";
import {
  narrationCatalogue,
  narrationFixture,
  preparationCatalogue,
} from "./runtime-narration.fake.js";
import { executionPlan, savedCatalogue } from "./runtime-plan.js";
import { executionStages, invocationReady } from "./runtime-store.js";
import { createRebuildDeps } from "./service.fake.js";
import { previewRebuild, startRebuild } from "./service.js";
import { workPieces } from "./work-records.js";

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

it.each([false, true])(
  "admits local recovery with completed narration (prepared=%s)",
  async (prepared) => {
    const catalogue = prepared ? preparationCatalogue : narrationCatalogue;
    const h = await narrationFixture(prepared ? "First sentence. Second sentence." : "abcdefgh", {
      catalogue,
      ...(prepared
        ? {
            config: {
              narrationPrompt: "Documentary",
              llm: { provider: "openrouter", model: "llm" },
              audio: { provider: "inworld", model: "inworld-tts-2", voice: "voice" },
              rendered: { narration: "Use restrained delivery." },
            },
            answer: () => '{"cues":[{"sentence":1,"kind":"instruction","text":"calm"}]}',
          }
        : {}),
    });
    try {
      await h.pump();
      const before = h.view();
      const calls = [...h.calls];
      const outputs = before.outputs.filter((row) => row.selected).map((row) => row.assetId);
      const saved = await saveRevision(h.deps, {
        projectId: h.projectId,
        baseRevisionId: before.revision.id,
        idempotencyKey: randomUUID(),
        edit: {
          config: before.revision.config,
          content: before.revision.content,
          regenerate: ["export:wav"],
        },
      });
      if (!saved.ok) throw new Error(JSON.stringify(saved));
      const helper = createRebuildDeps(h.deps, catalogue);
      const preview = await previewRebuild(helper.deps, {
        projectId: h.projectId,
        baseRevisionId: saved.view.revision.id,
        request: { kind: "selected", workKeys: ["export:wav"] },
      });
      if (!preview.ok) throw new Error(JSON.stringify(preview));
      expect(preview.value.work.find((row) => row.key === "audio:body:concat")?.disposition).toBe(
        "reuse",
      );
      const request = {
        projectId: h.projectId,
        baseRevisionId: saved.view.revision.id,
        idempotencyKey: randomUUID(),
        previewId: preview.value.id,
        acknowledgeUnknownCosts: false,
        confirmedProvidedWorkKeys: [],
      };
      const admitted = await startRebuild(helper.deps, request);
      expect(admitted.ok, JSON.stringify(admitted)).toBe(true);
      if (!admitted.ok) throw new Error(JSON.stringify(admitted));
      const stage = executionStages(h.deps, h.projectId).find(
        (row) => row.kind === "video" && admitted.value.workIds.includes(row.work.workId),
      );
      if (!stage) throw new Error("Missing admitted export");
      const row = h.deps.db
        .prepare("SELECT recipe_context FROM revision_work WHERE id=?")
        .get(stage.work.workId);
      expect(savedCatalogue(row?.recipe_context).tts).toEqual(catalogue.tts);
      expect(invocationReady(h.deps, stage.work)).toBe(true);
      const piece = workPieces(h.deps.db, stage.work.workId).find(
        (one) => one.key === "export:wav",
      );
      if (!piece) throw new Error("Missing export piece");
      expect(() =>
        exportSnapshot(
          h.deps,
          {
            work: stage.work,
            stage,
            signal: new AbortController().signal,
            maySubmit: () => true,
            emit: () => undefined,
          },
          piece,
        ),
      ).not.toThrow();
      materializeAdmittedWork(h.deps, h.projectId);
      expect(
        executionStages(h.deps, h.projectId).some((one) => one.work.workId === stage.work.workId),
      ).toBe(true);
      expect(await startRebuild(helper.deps, request)).toMatchObject({
        ok: true,
        value: { admissionId: admitted.value.admissionId, replayed: true },
      });
      expect(
        h
          .view()
          .outputs.filter((one) => one.selected)
          .map((one) => one.assetId),
      ).toEqual(outputs);
      expect(h.calls).toEqual(calls);
      expect(helper.readinessCalls).toEqual([]);
    } finally {
      h.close();
    }
  },
);
