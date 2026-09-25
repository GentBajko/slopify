import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { fakeLlm } from "../src/adapters/fake/llm.js";
import { previewRebuild } from "../src/slices/rebuild/service.js";
import { outputPath } from "../src/slices/storage/layout.js";
import { composedFixture, current, save, start } from "./revision-rebuild.fake.js";

// A written article only has its identity once it lands, so the document planned before it
// is re-planned against the article that was actually written, then published as current.
it("makes the document from a generated article and keeps it current", async () => {
  const h = await composedFixture({
    llm: () =>
      fakeLlm({
        deltas: [
          "# Rope\n\n## Knots\n\nRope has held knots for sailors, climbers and builders for as long as there has been rope.\n\n## Sources Consulted\n\n- [Knots](https://example.com/knots)\n",
        ],
      }),
  });
  const catalogue = {
    ...h.deps.catalogue.read(),
    providers: { ...h.deps.catalogue.read().providers, openrouter: { maxConcurrent: 1 } },
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
  h.setCatalogue(catalogue);
  const base = current(h.deps, h.projectId);
  await save(h.deps, h.projectId, {
    config: {
      ...base.revision.config,
      sources: {
        ...base.revision.config.sources,
        article: "generate",
        images: "off",
        video: "off",
        document: "generate",
      },
      document: { theme: "plain" },
      llm: { provider: "openrouter", model: "text" },
      provided: {},
      rendered: { article: "Write" },
    },
    content: {
      ...base.revision.content,
      articleEdited: false,
      imageOrder: [],
      imageDefinitions: {},
    },
  });

  await start(h.deps, h.projectId, ["article:body", "document:pdf"]);
  await h.runner.settled();

  const view = current(h.deps, h.projectId);
  const pdf = view.outputs.find((row) => row.selected && row.output.role === "document_pdf");
  expect(pdf).toMatchObject({ state: "ready", available: true, workKey: "document:pdf" });
  expect(pdf?.output.stageKind).toBe("document");
  const bytes = readFileSync(outputPath(h.deps.paths, h.projectId, pdf?.output.path ?? ""));
  expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
  expect(bytes.toString("latin1")).toContain("/URI (https://example.com/knots)");
  expect(
    h.deps.db
      .prepare("SELECT state FROM stages WHERE project_id=? AND kind='document'")
      .get(h.projectId),
  ).toEqual({ state: "done" });
  // Nothing is left to rebuild: the published document is the current one.
  const preview = await previewRebuild(h.deps, {
    projectId: h.projectId,
    baseRevisionId: view.revision.id,
    request: { kind: "allAffected" },
  });
  if (!preview.ok) throw new Error(JSON.stringify(preview));
  expect(
    preview.value.work
      .filter((row) => row.disposition !== "reuse")
      .map((row) => row.key)
      .filter((key) => key === "document:pdf" || key === "article:body"),
  ).toEqual([]);
});
