import { rmSync } from "node:fs";
import { expect, it } from "vitest";
import { saveRevision } from "../revisions/mutations.js";
import { writeAsset } from "../storage/assets.js";
import { outputPath } from "../storage/layout.js";
import type { OutputRole } from "../storage/model.js";
import { exportCatalogue, exportFixture } from "./runtime-export.fake.js";
import { executionPlan } from "./runtime-plan.js";
import {
  preparedResult,
  preparedText,
  preparedTexts,
  publishResult,
} from "./runtime-publication.js";
import { createRebuildDeps } from "./service.fake.js";
import { previewRebuild } from "./service.js";

it.each(["audio_export", "render_params"] as const)(
  "rebuilds WAV when its %s bundle member is missing despite a completed piece",
  async (missingRole) => {
    const h = await exportFixture();
    try {
      const { context, piece } = h.grant("export:wav");
      const asset = writeAsset(h.deps, h.projectId, "audio.wav", Buffer.from("finished wav"));
      const media = preparedResult(h.deps, context, piece, "audio_export", asset, 4000, {
        subtitlesMode: "off",
      });
      const params = preparedText(h.deps, context, piece, "render_params", "render.json", "{}");
      await publishResult(h.deps, context, piece, [media, params], { totalSeconds: 4 }, asset);
      h.deps.db
        .prepare("UPDATE revision_work SET state='done' WHERE id=?")
        .run(context.work.workId);
      const missing = missingRole === "audio_export" ? media : params;
      rmSync(outputPath(h.deps.paths, h.projectId, missing.asset.path));
      const view = h.view();
      expect(view.outputs.find((row) => row.output.role === missingRole)?.available).toBe(false);
      expect(
        executionPlan(h.deps, view, exportCatalogue).work.find((row) => row.key === "export:wav")
          ?.disposition,
      ).toBe("local");
      const helper = createRebuildDeps(h.deps);
      const preview = await previewRebuild(helper.deps, {
        projectId: h.projectId,
        baseRevisionId: view.revision.id,
        request: { kind: "allAffected" },
      });
      if (!preview.ok) throw new Error(JSON.stringify(preview));
      expect(preview.value.work.find((row) => row.key === "export:wav")?.disposition).toBe("local");
    } finally {
      h.close();
    }
  },
);

const textBundles: readonly { readonly key: string; readonly roles: readonly OutputRole[] }[] = [
  {
    key: "article:body",
    roles: ["article_md", "article_txt", "sources", "glossary", "instructions"],
  },
  {
    key: "subtitles:files",
    roles: ["subtitles_srt", "subtitles_vtt", "subtitle_ass", "subtitle_font"],
  },
  { key: "research:notes", roles: ["notes", "instructions"] },
  { key: "export:video", roles: ["video", "render_params"] },
];
it.each(textBundles.flatMap((bundle) => bundle.roles.map((missing) => ({ ...bundle, missing }))))(
  "does not reuse $key when its retained $missing sibling is missing",
  async ({ key, roles, missing }) => {
    const h = await exportFixture();
    try {
      const base = h.view();
      const saved = await saveRevision(h.deps, {
        projectId: h.projectId,
        baseRevisionId: base.revision.id,
        idempotencyKey: "bundle-config",
        edit: {
          config: {
            ...base.revision.config,
            sources: {
              ...base.revision.config.sources,
              research: "provide",
              article: key === "research:notes" ? "generate" : "provide",
              images: "generate",
              video: "generate",
            },
            provided: { ...base.revision.config.provided, research: "Research" },
            images: { provider: "fal", model: "image" },
            llm: { provider: "openrouter", model: "text" },
            rendered: { article: "Write an article" },
          },
          content: {
            ...base.revision.content,
            articleEdited: false,
            imageOrder: ["one"],
            imageDefinitions: { one: { source: "generate", assetId: null, prompt: "Image" } },
          },
        },
      });
      if (!saved.ok) throw new Error(JSON.stringify(saved));
      const { context, piece } = h.grant(key, saved.view.revision.id);
      const outputs = preparedTexts(
        h.deps,
        context,
        piece,
        roles.map((role) => [role, `${role}.txt`, "Retained result"] as const),
      );
      await publishResult(h.deps, context, piece, outputs, {});
      h.deps.db
        .prepare("UPDATE revision_work SET state='done' WHERE id=?")
        .run(context.work.workId);
      const plan = () =>
        executionPlan(h.deps, h.view(saved.view.revision.id), exportCatalogue).work.find(
          (row) => row.key === key,
        );
      expect(plan()?.disposition).toBe("reuse");
      const removed = outputs.find((row) => row.output.role === missing);
      if (removed === undefined) throw new Error("Missing test bundle member");
      rmSync(outputPath(h.deps.paths, h.projectId, removed.asset.path));
      expect(plan()?.disposition).toBe("local");
    } finally {
      h.close();
    }
  },
);
it("reuses a complete local article without optional sources, glossary or generated instructions", async () => {
  const h = await exportFixture();
  try {
    const { context, piece } = h.grant("article:body");
    await publishResult(
      h.deps,
      context,
      piece,
      preparedTexts(h.deps, context, piece, [
        ["article_md", "article.md", "Article"],
        ["article_txt", "article.txt", "Article"],
      ]),
      { text: "Article" },
    );
    expect(
      executionPlan(h.deps, h.view(), exportCatalogue).work.find(
        (row) => row.key === "article:body",
      )?.disposition,
    ).toBe("reuse");
  } finally {
    h.close();
  }
});
