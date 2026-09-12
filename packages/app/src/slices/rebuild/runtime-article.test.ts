import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { Catalogue } from "../../catalog/schema.js";
import { stageKinds } from "../../kernel/pipeline.js";
import type { StageContext } from "../../kernel/runner/index.js";
import type { StageProviders } from "../../kernel/runner/providers.js";
import { claimWork, maySubmit } from "../../kernel/runner/work-authority.js";
import { ensureBaseline } from "../revisions/adopt.js";
import { saveRevision } from "../revisions/mutations.js";
import { revisionFixture } from "../revisions/revision.fake.js";
import { getRevisionView } from "../revisions/view.js";
import { outputPath } from "../storage/layout.js";
import { admitInitialRevision } from "./runtime-admission.js";
import { executeProviderRecipe } from "./runtime-provider.js";
import { executionStages } from "./runtime-store.js";
import { workPieces } from "./work-records.js";

const catalogue: Catalogue = {
  schemaVersion: 1,
  updatedAt: "2026-09-12",
  providers: { openrouter: { maxConcurrent: 5 } },
  image: [],
  tts: [],
  llm: [
    {
      provider: "openrouter",
      id: "text",
      name: "Text",
      enabled: true,
      deprecated: false,
      source: "https://example.test",
      keywords: [],
      pricing: {},
      llm: { webSearch: true },
    },
  ],
};
async function fixture() {
  const h = revisionFixture();
  const config = {
    ...h.config,
    sources: { ...h.config.sources, article: "generate" as const },
    llm: { provider: "openrouter", model: "text" },
    provided: {},
    rendered: { article: "Write" },
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
  const stage = executionStages(h.deps, h.projectId).find((row) => row.kind === "article");
  if (stage === undefined) throw new Error("Missing article");
  const piece = workPieces(h.deps.db, stage.work.workId)[0];
  if (piece === undefined) throw new Error("Missing request");
  claimWork(h.deps.db, stage.work);
  const context: StageContext = {
    stage,
    work: stage.work,
    signal: new AbortController().signal,
    maySubmit: (id) => maySubmit(h.deps.db, stage.work, id),
    emit: () => {},
  };
  return { ...h, baseline: baseline.view, stage, piece, context };
}

describe("owned article continuations", () => {
  it("gives each continuation an exact durable request and publishes the assembled article", async () => {
    const h = await fixture();
    try {
      const bound: string[] = [];
      const providers: StageProviders = {
        llm: async (call) => {
          const continuation = call.messages.length > 1;
          if (continuation) expect(call.messages[1]?.content).toBe("First ");
          return {
            ok: true,
            value: {
              text: continuation ? "last." : "First ",
              finishReason: continuation ? "stop" : "length",
              usage: { inputTokens: 2, outputTokens: 3 },
            },
          };
        },
        tts: async () => {
          throw new Error("Unexpected TTS");
        },
        image: async () => {
          throw new Error("Unexpected image");
        },
        forPiece: (id) => {
          bound.push(id);
          return providers;
        },
      };
      const count = vi.fn();
      expect(await executeProviderRecipe({ ...h.deps, count }, h.context, providers, h.piece)).toBe(
        "done",
      );
      expect(count).toHaveBeenCalledExactlyOnceWith("stage.completed", {
        stage: "article",
        provider: "openrouter",
        model: "text",
        tokensIn: 4,
        tokensOut: 6,
      });
      const pieces = workPieces(h.deps.db, h.stage.work.workId);
      expect(pieces.map((piece) => piece.key)).toEqual(["article:body", "article:continuation:1"]);
      expect(new Set(bound).size).toBe(2);
      const instructions = getRevisionView(
        h.deps,
        h.projectId,
        h.baseline.revision.id,
      )?.outputs.find((row) => row.selected && row.output.role === "instructions");
      if (instructions === undefined) throw new Error("Missing frozen instructions");
      const text = readFileSync(
        outputPath(h.deps.paths, h.projectId, instructions.output.path),
        "utf8",
      );
      expect(text).toContain("## Article\n\n### user\n\nWrite");
      expect(text).toContain("## Article continuation 1");
      expect(text).toContain("First ");
      expect(getRevisionView(h.deps, h.projectId, h.baseline.revision.id)?.articleMarkdown).toBe(
        "First last.",
      );
    } finally {
      h.close();
    }
  });

  it("keeps an accepted partial answer and holds its next request after an article edit", async () => {
    const h = await fixture();
    try {
      let calls = 0;
      const providers: StageProviders = {
        llm: async () => {
          calls += 1;
          const saved = await saveRevision(h.deps, {
            projectId: h.projectId,
            baseRevisionId: h.baseline.revision.id,
            idempotencyKey: "new-article",
            edit: {
              config: { ...h.baseline.revision.config, rendered: { article: "Different article" } },
              content: h.baseline.revision.content,
            },
          });
          if (!saved.ok) throw new Error(JSON.stringify(saved));
          return {
            ok: true,
            value: { text: "Partial result", finishReason: "length", usage: null },
          };
        },
        tts: async () => {
          throw new Error("Unexpected TTS");
        },
        image: async () => {
          throw new Error("Unexpected image");
        },
        forPiece: () => providers,
      };
      expect(await executeProviderRecipe(h.deps, h.context, providers, h.piece)).toBe("held");
      expect(calls).toBe(1);
      expect(workPieces(h.deps.db, h.stage.work.workId)).toHaveLength(1);
      expect(
        h.deps.db.prepare("SELECT result_json FROM revision_work_pieces WHERE id=?").get(h.piece.id)
          ?.result_json,
      ).toContain("Partial result");
    } finally {
      h.close();
    }
  });
});
