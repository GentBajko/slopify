import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { saveRevision } from "../revisions/mutations.js";
import { outputPath } from "../storage/layout.js";
import { insertStagedFile } from "../storage/repo.js";
import { admitPendingRevision } from "./legacy-admission.fake.js";
import { retainedNarrationPieces } from "./narration-history.js";
import { narrationCatalogue, narrationFixture } from "./runtime-narration.fake.js";
import { executionPlan } from "./runtime-plan.js";

it("reuses exact historical request assets when a later revision returns to an earlier voice", async () => {
  const h = await narrationFixture();
  try {
    await h.pump();
    const original = h.view();
    const originalParts = original.pieces.filter(
      (one) => one.selected && one.piece.kind === "chunk",
    );
    for (const voice of ["different", "voice"]) {
      const base = h.view();
      const saved = await saveRevision(h.deps, {
        projectId: h.projectId,
        baseRevisionId: base.revision.id,
        idempotencyKey: voice,
        edit: {
          config: {
            ...base.revision.config,
            audio: { provider: "openai-tts", model: "tts", voice },
          },
          content: base.revision.content,
        },
      });
      if (!saved.ok) throw new Error(JSON.stringify(saved));
      h.calls.length = 0;
      const plan = executionPlan(h.deps, saved.view, narrationCatalogue);
      if (voice === "voice")
        expect(
          plan.work
            .filter(
              (one) => plan.recipes.find((recipe) => recipe.key === one.key)?.input.kind === "tts",
            )
            .map((one) => one.pieceIds),
        ).toEqual(originalParts.map((one) => [one.piece.id]));
      admitPendingRevision(h.deps, saved.view, narrationCatalogue);
      await h.pump();
      if (voice === "voice") {
        expect(h.calls).toEqual([]);
        expect(
          h
            .view()
            .pieces.filter((one) => one.selected && one.piece.kind === "chunk")
            .map((one) => one.assetId),
        ).toEqual(originalParts.map((one) => one.assetId));
        expect(
          h
            .view()
            .outputs.find(
              (one) => one.selected && one.state === "ready" && one.output.role === "audio_body",
            )?.available,
        ).toBe(true);
      }
    }
  } finally {
    h.close();
  }
}, 30000);

it("uses a freshly uploaded narration override without a paid request", async () => {
  const h = await narrationFixture();
  try {
    await h.pump();
    const base = h.view();
    const part = base.pieces.find((one) => one.selected && one.piece.kind === "chunk");
    const logicalKey = JSON.parse(part?.piece.payload ?? "{}").logicalKey;
    const bytes = Buffer.alloc(44 + 1600);
    bytes.write("RIFF");
    bytes.writeUInt32LE(bytes.length - 8, 4);
    bytes.write("WAVEfmt ", 8);
    bytes.writeUInt32LE(16, 16);
    bytes.writeUInt16LE(1, 20);
    bytes.writeUInt16LE(1, 22);
    bytes.writeUInt32LE(8000, 24);
    bytes.writeUInt32LE(16000, 28);
    bytes.writeUInt16LE(2, 32);
    bytes.writeUInt16LE(16, 34);
    bytes.write("data", 36);
    bytes.writeUInt32LE(1600, 40);
    writeFileSync(join(h.deps.paths.staging, "custom"), bytes);
    insertStagedFile(h.deps.db, {
      id: "custom",
      stageKind: "audio",
      path: "custom",
      originalFilename: "custom.wav",
      bytes: bytes.length,
      state: "staged",
      createdAt: h.deps.clock.now().toISOString(),
    });
    const saved = await saveRevision(
      { ...h.deps, measureAudio: async () => 100 },
      {
        projectId: h.projectId,
        baseRevisionId: base.revision.id,
        idempotencyKey: "upload",
        edit: {
          config: base.revision.config,
          content: base.revision.content,
          uploads: [
            { stagedFileId: "custom", destination: { kind: "narration", key: logicalKey } },
          ],
        },
      },
    );
    if (!saved.ok) throw new Error(JSON.stringify(saved));
    h.calls.length = 0;
    expect(
      executionPlan(h.deps, saved.view, narrationCatalogue).work.find(
        (one) => one.key === `${logicalKey}:1`,
      )?.disposition,
    ).toBe("reuse");
    admitPendingRevision(h.deps, saved.view, narrationCatalogue);
    await h.pump();
    expect(h.calls).toEqual([]);
    expect(
      h
        .view()
        .outputs.find(
          (one) => one.selected && one.state === "ready" && one.output.role === "audio_body",
        )?.available,
    ).toBe(true);
  } finally {
    h.close();
  }
}, 30000);

it("excludes foreign projects, missing historical bytes, and results from older regeneration tokens", async () => {
  const h = await narrationFixture();
  try {
    await h.pump();
    const base = h.view();
    const original = base.pieces.find((one) => one.selected && one.piece.kind === "chunk");
    if (original === undefined) throw new Error("Missing narration");
    const logicalKey = JSON.parse(original.piece.payload ?? "{}").logicalKey;
    expect(retainedNarrationPieces(h.deps, "another-project")).toEqual([]);
    const saved = await saveRevision(h.deps, {
      projectId: h.projectId,
      baseRevisionId: base.revision.id,
      idempotencyKey: "regenerate",
      edit: {
        config: base.revision.config,
        content: base.revision.content,
        regenerate: [original.key],
      },
    });
    if (!saved.ok) throw new Error(JSON.stringify(saved));
    expect(saved.view.revision.content.regenerationTokens[logicalKey]).toEqual(expect.any(String));
    expect(saved.view.revision.content.regenerationTokens[original.key]).toBeUndefined();
    const plan = executionPlan(h.deps, saved.view, narrationCatalogue);
    expect(
      plan.work
        .filter(
          (one) => plan.recipes.find((recipe) => recipe.key === one.key)?.input.kind === "tts",
        )
        .map((one) => [one.disposition, one.pieceIds]),
    ).toEqual([
      ["generate", []],
      ["generate", []],
    ]);
    const oldFile = JSON.parse(original.piece.payload ?? "{}").file;
    rmSync(outputPath(h.deps.paths, h.projectId, oldFile));
    expect(
      retainedNarrationPieces(h.deps, h.projectId)
        .filter((one) => one.assetId === original.assetId)
        .every((one) => !one.available),
    ).toBe(true);
  } finally {
    h.close();
  }
}, 30000);
