import { expect, it } from "vitest";
import { mutationFixture } from "./mutation.fake.js";
import { saveRevision } from "./mutations.js";
import { currentRevisionId, listRevisionHistory } from "./repo.js";

it("refuses Images Provide while generated definitions remain instead of saving generation", async () => {
  const h = await mutationFixture();
  try {
    const result = await saveRevision(h.deps, {
      projectId: h.projectId,
      baseRevisionId: h.base.revision.id,
      idempotencyKey: "provided-images",
      edit: {
        config: {
          ...h.config,
          sources: { ...h.config.sources, images: "provide" },
          images: { provider: "image", model: "model" },
        },
        content: {
          ...h.base.revision.content,
          imageOrder: ["one"],
          imageDefinitions: { one: { source: "generate", assetId: null, prompt: "A landscape" } },
        },
      },
    });
    expect(result).toMatchObject({
      ok: false,
      reason: "invalid-edit",
      fields: [
        {
          field: "sources.images",
          message: "Replace or remove generated images before choosing Provide.",
        },
      ],
    });
    expect(currentRevisionId(h.deps.db, h.projectId)).toBe(h.base.revision.id);
    expect(listRevisionHistory(h.deps.db, h.projectId)).toHaveLength(1);
    expect(h.deps.db.prepare("SELECT count(*) AS n FROM revision_mutations").get()?.n).toBe(0);
    expect(h.deps.db.prepare("SELECT count(*) AS n FROM attempts").get()?.n).toBe(0);
  } finally {
    h.close();
  }
});
