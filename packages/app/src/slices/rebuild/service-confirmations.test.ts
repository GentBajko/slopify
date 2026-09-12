import { expect, it } from "vitest";
import type { StageContext } from "../../kernel/runner/index.js";
import type { StageProviders } from "../../kernel/runner/providers.js";
import { claimWork, finishWork, maySubmit } from "../../kernel/runner/work-authority.js";
import { saveRevision } from "../revisions/mutations.js";
import { revisionById } from "../revisions/repo.js";
import { getRevisionView } from "../revisions/view.js";
import { exportFixture } from "./runtime-export.fake.js";
import { materializeAdmittedWork } from "./runtime-materialize.js";
import { runRevisionInvocation } from "./runtime-run.js";
import { executionStages, invocationReady } from "./runtime-store.js";
import { createRebuildDeps } from "./service.fake.js";
import { previewRebuild, startRebuild } from "./service.js";
import { workPieces } from "./work-records.js";

it("approves only the reviewed provided audio and manual cues without changing saved content", async () => {
  const h = await exportFixture();
  try {
    const base = h.view();
    const saved = await saveRevision(h.deps, {
      projectId: h.projectId,
      baseRevisionId: base.revision.id,
      idempotencyKey: "transcript-change",
      edit: {
        config: base.revision.config,
        content: {
          ...base.revision.content,
          articleMarkdown: "A revised transcript.",
          articleEdited: true,
        },
      },
    });
    if (!saved.ok) throw new Error(JSON.stringify(saved));
    const originalContent = saved.view.revision.content;
    const helper = createRebuildDeps(h.deps);
    const request = {
      projectId: h.projectId,
      baseRevisionId: saved.view.revision.id,
      request: { kind: "selected" as const, workKeys: ["subtitles:cues"] },
    };
    const preview = await previewRebuild(helper.deps, request);
    if (!preview.ok) throw new Error(JSON.stringify(preview));
    expect([...preview.value.providedReuseRequired].sort()).toEqual([
      "audio:provided",
      "subtitles:cues",
    ]);
    const start = {
      projectId: h.projectId,
      baseRevisionId: saved.view.revision.id,
      previewId: preview.value.id,
      idempotencyKey: "00000000-0000-4000-8000-000000000001",
      acknowledgeUnknownCosts: true,
      confirmedProvidedWorkKeys: ["audio:provided"],
    };
    expect(await startRebuild(helper.deps, start)).toMatchObject({
      ok: false,
      reason: "review-required",
    });
    expect(h.deps.db.prepare("SELECT count(*) AS n FROM rebuild_admissions").get()?.n).toBe(0);
    expect(helper.ticks).toEqual([]);
    const accepted = await startRebuild(helper.deps, {
      ...start,
      confirmedProvidedWorkKeys: ["audio:provided", "subtitles:cues"],
    });
    if (!accepted.ok) throw new Error(JSON.stringify(accepted));
    expect(helper.readinessCalls).toEqual([]);
    expect(revisionById(h.deps.db, h.projectId, saved.view.revision.id)?.content).toEqual(
      originalContent,
    );
    const providers: StageProviders = {
      llm: async () => {
        throw new Error("Review cannot generate article text");
      },
      tts: async () => {
        throw new Error("Review cannot regenerate provided narration");
      },
      image: async () => {
        throw new Error("Unexpected image request");
      },
      forPiece: () => providers,
    };
    for (let pass = 0; pass < 10; pass++) {
      materializeAdmittedWork(h.deps, h.projectId);
      const stage = executionStages(h.deps, h.projectId).find(
        (row) =>
          row.state === "pending" &&
          invocationReady(h.deps, row.work) &&
          workPieces(h.deps.db, row.work.workId).every(
            (piece) => !piece.key.startsWith("export:") && piece.key !== "subtitles:files",
          ),
      );
      if (stage === undefined) break;
      expect(claimWork(h.deps.db, stage.work)).toBe(true);
      const context: StageContext = {
        stage,
        work: stage.work,
        signal: new AbortController().signal,
        maySubmit: (id) => maySubmit(h.deps.db, stage.work, id),
        emit: () => undefined,
      };
      expect(await runRevisionInvocation(h.deps, context, providers)).toBe("done");
      finishWork(h.deps.db, stage.work, "done", null);
    }
    const current = getRevisionView(h.deps, h.projectId, saved.view.revision.id);
    const cues = current?.pieces.find((piece) => piece.selected && piece.key === "subtitles:cues");
    expect(cues?.available).toBe(true);
    expect(JSON.parse(cues?.piece.payload ?? "{}")).toMatchObject({
      cues: [{ text: "Edited caption.", start: 0, end: 3 }],
    });
    expect(current?.revision.content).toEqual(originalContent);
    const again = await previewRebuild(helper.deps, request);
    if (!again.ok) throw new Error(JSON.stringify(again));
    expect(again.value.providedReuseRequired).toEqual([]);
  } finally {
    h.close();
  }
});
