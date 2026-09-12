import { expect, it } from "vitest";
import { mutationFixture } from "./mutation.fake.js";
import { saveRevision } from "./mutations.js";
import { currentRevisionId, listRevisionHistory } from "./repo.js";

it.each(["", " \n\t "])(
  "rejects an empty manual article without replacing retained content (%j)",
  async (text) => {
    const h = await mutationFixture();
    try {
      const generated = await saveRevision(h.deps, {
        projectId: h.projectId,
        baseRevisionId: h.base.revision.id,
        idempotencyKey: "generated",
        edit: {
          config: {
            ...h.config,
            sources: { ...h.config.sources, article: "generate" },
            llm: { provider: "text", model: "model" },
            rendered: { article: "Write an article" },
          },
          content: { ...h.base.revision.content, promptTemplates: { article: "Write an article" } },
        },
      });
      if (!generated.ok) throw new Error(JSON.stringify(generated));
      const history = listRevisionHistory(h.deps.db, h.projectId);
      const assets = h.deps.db.prepare("SELECT * FROM project_assets ORDER BY id").all();
      const result = await saveRevision(h.deps, {
        projectId: h.projectId,
        baseRevisionId: generated.view.revision.id,
        idempotencyKey: "empty-edit",
        edit: {
          config: generated.view.revision.config,
          content: {
            ...generated.view.revision.content,
            articleMarkdown: text,
            articleEdited: true,
          },
        },
      });
      expect(result).toMatchObject({
        ok: false,
        reason: "invalid-edit",
        fields: [{ field: "content.articleMarkdown", message: "Enter article text." }],
      });
      expect(currentRevisionId(h.deps.db, h.projectId)).toBe(generated.view.revision.id);
      expect(listRevisionHistory(h.deps.db, h.projectId)).toEqual(history);
      expect(h.deps.db.prepare("SELECT * FROM project_assets ORDER BY id").all()).toEqual(assets);
      expect(h.deps.db.prepare("SELECT count(*) AS n FROM attempts").get()?.n).toBe(0);
    } finally {
      h.close();
    }
  },
);
