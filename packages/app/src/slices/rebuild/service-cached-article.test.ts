import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import type { Catalogue } from "../../catalog/schema.js";
import { stageKinds } from "../../kernel/pipeline.js";
import type { StageContext } from "../../kernel/runner/index.js";
import type { StageProviders } from "../../kernel/runner/providers.js";
import { claimWork, maySubmit } from "../../kernel/runner/work-authority.js";
import { ensureBaseline } from "../revisions/adopt.js";
import { saveRevision } from "../revisions/mutations.js";
import { revisionFixture } from "../revisions/revision.fake.js";
import { getRevisionView } from "../revisions/view.js";
import { recoverWork } from "./repo.js";
import { admitInitialRevision } from "./runtime-admission.js";
import { executeProviderRecipe } from "./runtime-provider.js";
import { executionStages } from "./runtime-store.js";
import { createRebuildDeps } from "./service.fake.js";
import { previewRebuild, startRebuild } from "./service.js";
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

async function cacheAnswers(
  h: Awaited<ReturnType<typeof fixture>>,
  finishes: readonly ("length" | "stop" | null)[],
) {
  let calls = 0;
  const providers: StageProviders = {
    llm: async () => {
      const finishReason = finishes[calls];
      if (finishReason === undefined) return { ok: false, reason: "held" };
      calls += 1;
      return { ok: true, value: { text: `Part ${calls}. `, finishReason, usage: null } };
    },
    tts: async () => {
      throw new Error("Unexpected TTS");
    },
    image: async () => {
      throw new Error("Unexpected image");
    },
    forPiece: (id) => {
      h.deps.db
        .prepare("UPDATE revision_work_pieces SET submitted_at='submitted' WHERE id=?")
        .run(id);
      return providers;
    },
  };
  h.deps.db.exec(
    "CREATE TRIGGER fail_publish BEFORE INSERT ON revision_outputs WHEN NEW.work_key='article:body' BEGIN SELECT RAISE(ABORT, 'publication failure'); END",
  );
  const result = executeProviderRecipe(h.deps, h.context, providers, h.piece);
  if (finishes.at(-1) !== "length") await expect(result).rejects.toThrow("publication failure");
  else expect(await result).toBe("held");
  h.deps.db.exec("DROP TRIGGER fail_publish");
  recoverWork(h.deps.db);
  return { providers, calls: () => calls };
}

function unavailable(h: Awaited<ReturnType<typeof fixture>>) {
  const helper = createRebuildDeps(h.deps, {
    ...catalogue,
    llm: catalogue.llm.map((model) => ({ ...model, enabled: false })),
  });
  const deps = {
    ...helper.deps,
    providers: async () => {
      helper.readinessCalls.push("providers");
      return [];
    },
    modelsFor: async () => {
      helper.readinessCalls.push("models");
      return [];
    },
  };
  return { ...helper, deps };
}

it.each([
  ["stop"],
  [null],
  ["length", null],
  ["length", "stop"],
  ["length", "length", "stop"],
  ["length", "length", "length", "stop"],
] as const)(
  "publishes cached article answers without new costs or readiness (%j)",
  async (...finishes) => {
    const h = await fixture();
    try {
      const cached = await cacheAnswers(h, finishes);
      const helper = unavailable(h);
      const preview = await previewRebuild(helper.deps, {
        projectId: h.projectId,
        baseRevisionId: h.baseline.revision.id,
        request: { kind: "selected", workKeys: ["article:body"] },
      });
      if (!preview.ok) throw new Error(JSON.stringify(preview));
      expect(preview.value.costs.unknown).toBe(0);
      expect(preview.value.warnings).toEqual([]);
      const started = await startRebuild(helper.deps, {
        projectId: h.projectId,
        baseRevisionId: h.baseline.revision.id,
        idempotencyKey: randomUUID(),
        previewId: preview.value.id,
        acknowledgeUnknownCosts: false,
        confirmedProvidedWorkKeys: [],
      });
      if (!started.ok) throw new Error(JSON.stringify(started));
      expect(started.value.workIds).toContain(h.stage.work.workId);
      expect(helper.readinessCalls).toEqual([]);
      expect(claimWork(h.deps.db, h.stage.work)).toBe(true);
      expect(await executeProviderRecipe(h.deps, h.context, cached.providers, h.piece)).toBe(
        "done",
      );
      expect(cached.calls()).toBe(finishes.length);
      expect(getRevisionView(h.deps, h.projectId, h.baseline.revision.id)?.articleMarkdown).toBe(
        finishes.map((_, index) => `Part ${index + 1}. `).join(""),
      );
    } finally {
      h.close();
    }
  },
);

it.each([["length"], ["length", "length"]] as const)(
  "requires readiness for an unfinished cached article chain (%j)",
  async (...finishes) => {
    const h = await fixture();
    try {
      await cacheAnswers(h, finishes);
      const helper = unavailable(h);
      const preview = await previewRebuild(helper.deps, {
        projectId: h.projectId,
        baseRevisionId: h.baseline.revision.id,
        request: { kind: "selected", workKeys: ["article:body"] },
      });
      if (!preview.ok) throw new Error(JSON.stringify(preview));
      expect(preview.value.costs.unknown).toBeGreaterThan(0);
      expect(
        await startRebuild(helper.deps, {
          projectId: h.projectId,
          baseRevisionId: h.baseline.revision.id,
          idempotencyKey: randomUUID(),
          previewId: preview.value.id,
          acknowledgeUnknownCosts: true,
          confirmedProvidedWorkKeys: [],
        }),
      ).toMatchObject({ ok: false, reason: "readiness" });
      expect(helper.readinessCalls).toEqual(["providers"]);
    } finally {
      h.close();
    }
  },
);

it.each(["changed-inputs", "revoked-body", "revoked-continuation"] as const)(
  "does not treat an unowned cached article as a free recovery (%s)",
  async (change) => {
    const h = await fixture();
    try {
      await cacheAnswers(h, ["length", "stop"]);
      let revisionId = h.baseline.revision.id;
      if (change === "changed-inputs") {
        const saved = await saveRevision(h.deps, {
          projectId: h.projectId,
          baseRevisionId: revisionId,
          idempotencyKey: "different-inputs",
          edit: {
            config: { ...h.baseline.revision.config, rendered: { article: "Different article" } },
            content: h.baseline.revision.content,
          },
        });
        if (!saved.ok) throw new Error(JSON.stringify(saved));
        revisionId = saved.view.revision.id;
      } else {
        h.deps.db
          .prepare("DELETE FROM revision_work_reservations WHERE revision_id=? AND work_key=?")
          .run(revisionId, change === "revoked-body" ? "article:body" : "article:continuation:1");
      }
      const helper = unavailable(h);
      const preview = await previewRebuild(helper.deps, {
        projectId: h.projectId,
        baseRevisionId: revisionId,
        request: { kind: "selected", workKeys: ["article:body"] },
      });
      if (!preview.ok) throw new Error(JSON.stringify(preview));
      expect(preview.value.costs.unknown).toBeGreaterThan(0);
      expect(
        await startRebuild(helper.deps, {
          projectId: h.projectId,
          baseRevisionId: revisionId,
          idempotencyKey: randomUUID(),
          previewId: preview.value.id,
          acknowledgeUnknownCosts: true,
          confirmedProvidedWorkKeys: [],
        }),
      ).toMatchObject({ ok: false, reason: "readiness" });
    } finally {
      h.close();
    }
  },
);
