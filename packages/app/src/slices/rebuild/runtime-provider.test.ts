import { describe, expect, it, vi } from "vitest";
import type { Catalogue } from "../../catalog/schema.js";
import { createAudioPreviewStore } from "../../kernel/audio-preview.js";
import { stageKinds } from "../../kernel/pipeline.js";
import type { StageContext } from "../../kernel/runner/index.js";
import type { StageProviders } from "../../kernel/runner/providers.js";
import { ensureBaseline } from "../revisions/adopt.js";
import { saveRevision } from "../revisions/mutations.js";
import { revisionFixture } from "../revisions/revision.fake.js";
import { getRevisionView } from "../revisions/view.js";
import { admitInitialRevision } from "./runtime-admission.js";
import { executeProviderRecipe } from "./runtime-provider.js";
import { executionStages } from "./runtime-store.js";
import { workPieces } from "./work-records.js";

const catalogue: Catalogue = {
  schemaVersion: 1,
  updatedAt: "2026-09-12",
  providers: { fal: { maxConcurrent: 5 } },
  llm: [],
  tts: [],
  image: [
    {
      provider: "fal",
      id: "image",
      name: "Image",
      enabled: true,
      deprecated: false,
      source: "https://example.test",
      pricing: {},
      keywords: [],
      image: { aspectRatios: ["16:9", "9:16"] },
    },
  ],
};

describe("revision provider publication", () => {
  it("retains a changed image result in its original revision", async () => {
    const h = revisionFixture();
    try {
      const config = {
        ...h.config,
        sources: { ...h.config.sources, images: "generate" as const },
        images: { provider: "fal", model: "image" },
        imagePrompts: [{ name: "image", number: 1 }],
        rendered: { "imagePrompts.0": "Original prompt" },
      };
      h.deps.db
        .prepare("UPDATE projects SET config=? WHERE id=?")
        .run(JSON.stringify(config), h.projectId);
      for (const kind of stageKinds)
        h.deps.db
          .prepare(
            "INSERT INTO stages(id,project_id,kind,source,state) VALUES (?,?,?,'generate','pending')",
          )
          .run(kind, h.projectId, kind);
      const baseline = await ensureBaseline(h.deps, h.projectId);
      if (!baseline.ok) throw new Error("Expected baseline");
      admitInitialRevision(h.deps, baseline.view, catalogue);
      const stage = executionStages(h.deps, h.projectId).find((row) => row.kind === "images");
      if (stage === undefined) throw new Error("Missing image invocation");
      const piece = workPieces(h.deps.db, stage.work.workId)[0];
      if (piece === undefined) throw new Error("Missing image request");
      let release = (): void => {};
      const pending = new Promise<void>((resolve) => {
        release = resolve;
      });
      const seen: string[] = [];
      const providers: StageProviders = {
        llm: async () => {
          throw new Error("Unexpected LLM");
        },
        tts: async () => {
          throw new Error("Unexpected narration");
        },
        image: async (input) => {
          seen.push(input.prompt);
          await pending;
          return { ok: true, value: { bytes: new Uint8Array([1, 2, 3]), mime: "image/png" } };
        },
        forPiece: () => providers,
      };
      const events: string[] = [];
      const context: StageContext = {
        stage,
        work: stage.work,
        signal: new AbortController().signal,
        maySubmit: () => true,
        emit: (event) => {
          events.push(event.type);
        },
      };
      const count = vi.fn();
      const output = executeProviderRecipe({ ...h.deps, count }, context, providers, piece);
      const key = baseline.view.revision.content.imageOrder[0];
      if (key === undefined) throw new Error("Missing image key");
      const saved = await saveRevision(h.deps, {
        projectId: h.projectId,
        baseRevisionId: baseline.view.revision.id,
        idempotencyKey: "edit-image",
        edit: {
          config: baseline.view.revision.config,
          content: {
            ...baseline.view.revision.content,
            imageDefinitions: {
              [key]: { source: "generate", assetId: null, prompt: "New prompt", templateKey: null },
            },
          },
        },
      });
      if (!saved.ok) throw new Error(JSON.stringify(saved));
      release();
      expect(await output).toBe("done");
      expect(seen).toEqual(["Original prompt"]);
      expect(await executeProviderRecipe({ ...h.deps, count }, context, providers, piece)).toBe(
        "done",
      );
      expect(seen).toEqual(["Original prompt"]);
      expect(count).toHaveBeenCalledExactlyOnceWith("stage.completed", {
        stage: "images",
        provider: "fal",
        model: "image",
        images: 1,
      });
      const old = getRevisionView(h.deps, h.projectId, baseline.view.revision.id);
      const current = getRevisionView(h.deps, h.projectId, saved.view.revision.id);
      expect(old?.outputs.some((row) => row.output.role === "image" && row.available)).toBe(true);
      expect(current?.outputs.some((row) => row.output.role === "image" && row.selected)).toBe(
        false,
      );
      expect(events).not.toContain("project.updated");
    } finally {
      h.close();
    }
  });
});

it("streams narration with exact origin identity and keeps sibling previews", async () => {
  const h = revisionFixture();
  const audioPreviews = createAudioPreviewStore();
  try {
    const config = {
      ...h.config,
      sources: { ...h.config.sources, audio: "generate" as const },
      audio: { provider: "openai-tts", model: "tts", voice: "narrator" },
    };
    h.deps.db
      .prepare("UPDATE projects SET config=? WHERE id=?")
      .run(JSON.stringify(config), h.projectId);
    for (const kind of stageKinds)
      h.deps.db
        .prepare(
          "INSERT INTO stages(id,project_id,kind,source,state) VALUES (?,?,?,'generate','pending')",
        )
        .run(kind, h.projectId, kind);
    const base = await ensureBaseline(h.deps, h.projectId);
    if (!base.ok) throw new Error("Missing revision");
    admitInitialRevision(h.deps, base.view, {
      ...catalogue,
      providers: { ...catalogue.providers, "openai-tts": { maxConcurrent: 5 } },
      tts: [
        {
          provider: "openai-tts",
          id: "tts",
          name: "TTS",
          enabled: true,
          deprecated: false,
          source: "https://example.test",
          pricing: {},
          keywords: [],
          tts: { maxCharacters: 4000, streaming: true },
        },
      ],
    });
    const stage = executionStages(h.deps, h.projectId).find((row) =>
      workPieces(h.deps.db, row.work.workId).some((piece) => piece.input.kind === "tts"),
    );
    if (stage === undefined) throw new Error("Missing narration invocation");
    const piece = workPieces(h.deps.db, stage.work.workId)[0];
    if (piece === undefined) throw new Error("Missing narration piece");
    const sibling = audioPreviews.begin(h.projectId, "sibling", "Other audio", {
      revisionId: "other",
      workId: "other",
      workPieceId: "other",
    });
    sibling.append(new Uint8Array([9]));
    let release = (): void => undefined;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const providers: StageProviders = {
      llm: async () => {
        throw new Error("Unexpected LLM");
      },
      image: async () => {
        throw new Error("Unexpected image");
      },
      tts: async (_input, observe) => {
        observe?.({ type: "start" });
        observe?.({ type: "chunk", bytes: new Uint8Array([1, 2, 3]) });
        await pending;
        observe?.({ type: "complete" });
        return { ok: true, value: { bytes: new Uint8Array([1, 2, 3]), container: "mp3" } };
      },
      forPiece: () => providers,
    };
    const context: StageContext = {
      stage,
      work: stage.work,
      signal: new AbortController().signal,
      maySubmit: () => true,
      emit: () => undefined,
    };
    const running = executeProviderRecipe({ ...h.deps, audioPreviews }, context, providers, piece);
    expect(audioPreviews.list(h.projectId)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          revisionId: stage.work.revisionId,
          workId: stage.work.workId,
          workPieceId: piece.id,
          state: "streaming",
          bytes: 3,
          label: "Body",
        }),
      ]),
    );
    release();
    expect(await running).toBe("done");
    expect(audioPreviews.list(h.projectId)).toHaveLength(2);
    expect(audioPreviews.list(h.projectId).find((row) => row.workPieceId === piece.id)?.state).toBe(
      "ready",
    );
  } finally {
    audioPreviews.close();
    h.close();
  }
});
