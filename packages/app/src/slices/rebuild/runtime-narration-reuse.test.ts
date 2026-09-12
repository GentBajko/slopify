import { readFileSync, rmSync } from "node:fs";
import { expect, it } from "vitest";
import { saveRevision } from "../revisions/mutations.js";
import { outputPath } from "../storage/layout.js";
import { admitPendingRevision } from "./legacy-admission.fake.js";
import { narrationCatalogue, narrationFixture } from "./runtime-narration.fake.js";
import { executionPlan } from "./runtime-plan.js";

it("binds unchanged requests under new logical keys and concatenates them with no paid TTS", async () => {
  const h = await narrationFixture();
  try {
    await h.pump();
    const old = h.view();
    const parts = old.pieces.filter(
      (one) => one.selected && one.stageKind === "audio" && one.piece.kind === "chunk",
    );
    expect(parts).toHaveLength(2);
    const oldBody = old.outputs.find((one) => one.selected && one.output.role === "audio_body");
    expect(oldBody?.available).toBe(true);
    h.calls.length = 0;
    const saved = await saveRevision(h.deps, {
      projectId: h.projectId,
      baseRevisionId: old.revision.id,
      idempotencyKey: "boundaries",
      edit: {
        config: old.revision.config,
        content: { ...old.revision.content, articleMarkdown: "abcd\n\nefgh", articleEdited: true },
      },
    });
    if (!saved.ok) throw new Error(JSON.stringify(saved));
    const plan = executionPlan(h.deps, saved.view, narrationCatalogue);
    const reused = plan.work.filter(
      (one) => plan.recipes.find((row) => row.key === one.key)?.input.kind === "tts",
    );
    expect(reused.map((one) => [one.disposition, one.pieceIds])).toEqual(
      parts.map((one) => ["reuse", [one.piece.id]]),
    );
    admitPendingRevision(h.deps, saved.view, narrationCatalogue);
    await h.pump();
    const next = h.view();
    expect(h.calls).toEqual([]);
    const selected = next.pieces.filter(
      (one) =>
        one.selected && plan.recipes.some((row) => row.input.kind === "tts" && row.key === one.key),
    );
    expect(selected.map((one) => one.assetId)).toEqual(parts.map((one) => one.assetId));
    expect(selected.map((one) => one.key)).not.toEqual(parts.map((one) => one.key));
    expect(selected.map((one) => JSON.parse(one.piece.payload ?? "{}"))).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          text: "abcd",
          logicalText: "abcd",
          provider: "openai-tts",
          model: "tts",
          voice: "voice",
        }),
        expect.objectContaining({
          text: "efgh",
          logicalText: "efgh",
          provider: "openai-tts",
          model: "tts",
          voice: "voice",
        }),
      ]),
    );
    const body = next.outputs.find(
      (one) => one.selected && one.state === "ready" && one.output.role === "audio_body",
    );
    expect(body?.available).toBe(true);
    expect(body?.assetId).toBe(oldBody?.assetId);
    if (oldBody === undefined) throw new Error("No original body");
    expect(
      readFileSync(outputPath(h.deps.paths, h.projectId, oldBody.output.path)).length,
    ).toBeGreaterThan(0);
  } finally {
    h.close();
  }
}, 30000);

it("will generate a missing retained part instead of marking its new binding done", async () => {
  const h = await narrationFixture();
  try {
    await h.pump();
    const old = h.view();
    const part = old.pieces.find((one) => one.selected && one.piece.kind === "chunk");
    const payload = JSON.parse(part?.piece.payload ?? "{}");
    rmSync(outputPath(h.deps.paths, h.projectId, payload.file));
    const saved = await saveRevision(h.deps, {
      projectId: h.projectId,
      baseRevisionId: old.revision.id,
      idempotencyKey: "missing",
      edit: {
        config: old.revision.config,
        content: { ...old.revision.content, articleMarkdown: "abcd\n\nefgh", articleEdited: true },
      },
    });
    if (!saved.ok) throw new Error(JSON.stringify(saved));
    const plan = executionPlan(h.deps, saved.view, narrationCatalogue);
    expect(
      plan.work
        .filter((one) => plan.recipes.find((row) => row.key === one.key)?.input.kind === "tts")
        .map((one) => one.disposition),
    ).toEqual(["generate", "reuse"]);
  } finally {
    h.close();
  }
});

it.each(["efgh\n\nabcd", "efgh\n\nijkl"])(
  "counts only new physical narration when rebuilding %s",
  async (text) => {
    const h = await narrationFixture();
    try {
      await h.pump();
      expect(
        h.count.mock.calls
          .filter((call) => call[1]?.audioSeconds !== undefined)
          .map((call) => call[1]?.audioSeconds),
      ).toEqual([0.1, 0.1]);
      const old = h.view();
      const oldBody = old.outputs.find((one) => one.selected && one.output.role === "audio_body");
      h.calls.length = 0;
      h.count.mockClear();
      const saved = await saveRevision(h.deps, {
        projectId: h.projectId,
        baseRevisionId: old.revision.id,
        idempotencyKey: "reorder",
        edit: {
          config: old.revision.config,
          content: { ...old.revision.content, articleMarkdown: text, articleEdited: true },
        },
      });
      if (!saved.ok) throw new Error(JSON.stringify(saved));
      admitPendingRevision(h.deps, saved.view, narrationCatalogue);
      await h.pump();
      expect(h.calls.filter((one) => one.kind === "tts").map((one) => one.text)).toEqual(
        text.endsWith("ijkl") ? ["ijkl"] : [],
      );
      expect(
        h.count.mock.calls
          .filter((call) => call[1]?.audioSeconds !== undefined)
          .map((call) => call[1]?.audioSeconds),
      ).toEqual(text.endsWith("ijkl") ? [0.1] : []);
      const body = h
        .view()
        .outputs.find(
          (one) => one.selected && one.state === "ready" && one.output.role === "audio_body",
        );
      expect(body?.available).toBe(true);
      expect(body?.assetId).not.toBe(oldBody?.assetId);
      await h.pump();
      expect(h.count.mock.calls.filter((call) => call[1]?.audioSeconds !== undefined)).toHaveLength(
        text.endsWith("ijkl") ? 1 : 0,
      );
    } finally {
      h.close();
    }
  },
  30000,
);

it("binds an explicit narration asset and requests review when its voice context changes", async () => {
  const h = await narrationFixture();
  try {
    await h.pump();
    const old = h.view();
    const part = old.pieces.find((one) => one.selected && one.piece.kind === "chunk");
    if (part?.assetId === null || part === undefined) throw new Error("Missing asset");
    const logicalKey = JSON.parse(part.piece.payload ?? "{}").logicalKey;
    const saved = await saveRevision(h.deps, {
      projectId: h.projectId,
      baseRevisionId: old.revision.id,
      idempotencyKey: "override",
      edit: {
        config: old.revision.config,
        content: {
          ...old.revision.content,
          narrationOverrides: { [logicalKey]: { kind: "asset", assetId: part.assetId } },
        },
      },
    });
    if (!saved.ok) throw new Error(JSON.stringify(saved));
    h.calls.length = 0;
    admitPendingRevision(h.deps, saved.view, narrationCatalogue);
    await h.pump();
    const next = h.view();
    expect(next.pieces.find((one) => one.selected && one.key === `${logicalKey}:1`)?.assetId).toBe(
      part.assetId,
    );
    expect(
      next.outputs.find(
        (one) => one.selected && one.state === "ready" && one.output.role === "audio_body",
      )?.available,
    ).toBe(true);
    expect(h.calls).toEqual([]);
    const changed = await saveRevision(h.deps, {
      projectId: h.projectId,
      baseRevisionId: next.revision.id,
      idempotencyKey: "voice",
      edit: {
        config: {
          ...next.revision.config,
          audio: { provider: "openai-tts", model: "tts", voice: "changed" },
        },
        content: next.revision.content,
      },
    });
    if (!changed.ok) throw new Error(JSON.stringify(changed));
    const plan = executionPlan(h.deps, changed.view, narrationCatalogue);
    expect(plan.work.find((one) => one.key === `${logicalKey}:1`)?.disposition).toBe("review");
  } finally {
    h.close();
  }
}, 30000);

it("retries missing request bytes even when the original invocation finished", async () => {
  const h = await narrationFixture();
  try {
    await h.pump();
    const old = h.view();
    const part = old.pieces.find((one) => one.selected && one.piece.kind === "chunk");
    const body = old.outputs.find((one) => one.selected && one.output.role === "audio_body");
    if (part === undefined || body === undefined) throw new Error("Missing narration");
    rmSync(outputPath(h.deps.paths, h.projectId, JSON.parse(part.piece.payload ?? "{}").file));
    rmSync(outputPath(h.deps.paths, h.projectId, body.output.path));
    h.calls.length = 0;
    admitPendingRevision(h.deps, h.view(), narrationCatalogue);
    await h.pump();
    expect(h.calls.filter((one) => one.kind === "tts").map((one) => one.text)).toEqual(["abcd"]);
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

it("projects every reused physical part in current order after a logical text override", async () => {
  const h = await narrationFixture();
  try {
    await h.pump();
    const old = h.view();
    const first = old.pieces.find((one) => one.selected && one.piece.kind === "chunk");
    const logicalKey = JSON.parse(first?.piece.payload ?? "{}").logicalKey;
    const saved = await saveRevision(h.deps, {
      projectId: h.projectId,
      baseRevisionId: old.revision.id,
      idempotencyKey: "insert-part",
      edit: {
        config: old.revision.config,
        content: {
          ...old.revision.content,
          narrationOverrides: { [logicalKey]: { kind: "text", text: "zzzzabcdefgh" } },
        },
      },
    });
    if (!saved.ok) throw new Error(JSON.stringify(saved));
    h.calls.length = 0;
    admitPendingRevision(h.deps, saved.view, narrationCatalogue);
    await h.pump();
    expect(h.calls.filter((one) => one.kind === "tts").map((one) => one.text)).toEqual(["zzzz"]);
    expect(
      h.deps.db
        .prepare(
          "SELECT payload FROM stage_pieces WHERE stage_id='audio' AND kind='chunk' ORDER BY idx",
        )
        .all()
        .map((one) => JSON.parse(String(one.payload)).text),
    ).toEqual(["zzzz", "abcd", "efgh"]);
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
