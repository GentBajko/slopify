import type { Catalogue } from "../../catalog/schema.js";
import { stageKinds } from "../../kernel/pipeline.js";
import type { RevisionDeps } from "../revisions/model.js";
import { mutationFixture } from "../revisions/mutation.fake.js";
import { providers as providerCatalog } from "../settings/model.js";
import { exportCatalogue } from "./runtime-export.fake.js";
import type { RebuildDeps } from "./service.js";

export function createRebuildDeps(base: RevisionDeps, initial: Catalogue = exportCatalogue) {
  let catalogue = initial;
  const ticks: string[] = [];
  const readinessCalls: string[] = [];
  const deps: RebuildDeps = {
    ...base,
    catalogue: {
      read: () => catalogue,
      models: (provider, family) => catalogue[family].filter((one) => one.provider === provider),
      refresh: async () => undefined,
      status: () => ({
        updatedAt: catalogue.updatedAt,
        path: "fake",
        warning: null,
        source: "fake",
      }),
    },
    runner: {
      tick: (id) => {
        ticks.push(id);
      },
      settled: async () => undefined,
      abortProject: async () => undefined,
      abortAll: async () => undefined,
    },
    emit: () => undefined,
    providers: async () => {
      readinessCalls.push("providers");
      return ["llm", "tts", "image"].flatMap((family) =>
        providerCatalog
          .filter((one) => one.family === family)
          .map((one) => ({
            id: one.id,
            family: family as "llm" | "tts" | "image",
            displayName: one.id,
            readiness: { kind: "cli" as const, installed: true },
          })),
      );
    },
    modelsFor: async (provider, family) => {
      readinessCalls.push(`${provider}:${family}`);
      return catalogue[family].map((one) => ({ id: one.id, name: one.name }));
    },
  };
  return {
    deps,
    ticks,
    readinessCalls,
    setCatalogue: (next: Catalogue) => {
      catalogue = next;
    },
  };
}
export async function serviceFixture() {
  const h = await mutationFixture();
  for (const kind of stageKinds)
    h.deps.db
      .prepare(
        "INSERT OR IGNORE INTO stages(id,project_id,kind,source,state) VALUES (?,?,?,'generate','pending')",
      )
      .run(kind, h.projectId, kind);
  return { ...h, ...createRebuildDeps(h.deps) };
}
export async function paidServiceFixture() {
  const h = await serviceFixture();
  const { saveRevision } = await import("../revisions/mutations.js");
  const base = await saveRevision(h.deps, {
    projectId: h.projectId,
    baseRevisionId: h.base.revision.id,
    idempotencyKey: "images",
    edit: {
      config: {
        ...h.config,
        sources: { ...h.config.sources, images: "generate" },
        images: { provider: "fal", model: "image" },
      },
      content: {
        ...h.base.revision.content,
        imageOrder: ["one", "two"],
        imageDefinitions: {
          one: { source: "generate", prompt: "One", assetId: null },
          two: { source: "generate", prompt: "Two", assetId: null },
        },
      },
    },
  });
  if (!base.ok) throw new Error(JSON.stringify(base));
  const catalogue: Catalogue = {
    ...exportCatalogue,
    providers: { fal: { maxConcurrent: 5 } },
    image: [
      {
        provider: "fal",
        id: "image",
        name: "Image",
        enabled: true,
        deprecated: false,
        source: "https://example.test",
        keywords: [],
        pricing: { perImage: 0.04 },
        image: { aspectRatios: ["16:9", "9:16"] },
      },
    ],
  };
  h.setCatalogue(catalogue);
  return { ...h, base: base.view, catalogue };
}
