import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { saveRevision } from "../revisions/mutations.js";
import { paidServiceFixture } from "./service.fake.js";
import { previewRebuild, startRebuild } from "./service.js";

it.each(["claude-code", "codex", "gemini", "codex-image"] as const)(
  "admits a rebuild through host-managed %s without comparing container paths",
  async (provider) => {
    const h = await paidServiceFixture();
    try {
      const image = provider === "codex-image";
      const saved = await saveRevision(h.deps, {
        projectId: h.projectId,
        baseRevisionId: h.base.revision.id,
        idempotencyKey: randomUUID(),
        edit: {
          config: {
            ...h.base.revision.config,
            ...(image
              ? { images: { provider, model: "codex-imagegen" } }
              : {
                  sources: { ...h.base.revision.config.sources, article: "generate" },
                  llm: { provider, model: "text" },
                  provided: {},
                  rendered: { article: "Write text." },
                }),
          },
          content: {
            ...h.base.revision.content,
            ...(!image ? { articleMarkdown: undefined, articleEdited: false } : {}),
          },
        },
      });
      if (!saved.ok) throw new Error(JSON.stringify(saved));
      const preview = await previewRebuild(h.deps, {
        projectId: h.projectId,
        baseRevisionId: saved.view.revision.id,
        request: { kind: "selected", workKeys: [image ? "image:one" : "article:body"] },
      });
      if (!preview.ok) throw new Error(JSON.stringify(preview));
      const result = await startRebuild(
        {
          ...h.deps,
          providers: async () => [
            {
              id: provider,
              family: image ? "image" : "llm",
              displayName: provider,
              readiness: { kind: "cli", installed: true },
              cliPath: { configured: null, command: `/host/bin/${provider}`, managedOnHost: true },
            },
          ],
          modelsFor: async () => [{ id: image ? "codex-imagegen" : "text", name: "Test" }],
        },
        {
          projectId: h.projectId,
          baseRevisionId: saved.view.revision.id,
          previewId: preview.value.id,
          idempotencyKey: randomUUID(),
          acknowledgeUnknownCosts: true,
          confirmedProvidedWorkKeys: preview.value.providedReuseRequired,
        },
      );
      expect(result.ok).toBe(true);
      expect(h.ticks).toEqual([h.projectId]);
      expect(h.deps.db.prepare("SELECT count(*) n FROM rebuild_admissions").get()?.n).toBe(1);
    } finally {
      h.close();
    }
  },
);
