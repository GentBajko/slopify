import { describe, expect, it } from "vitest";
import type { Catalogue } from "../../catalog/schema.js";
import { stageKinds } from "../../kernel/pipeline.js";
import { maySubmit } from "../../kernel/runner/work-authority.js";
import { ensureBaseline } from "../revisions/adopt.js";
import { revisionFixture } from "../revisions/revision.fake.js";
import { admitInitialRevision } from "./runtime-admission.js";
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
      id: "test",
      name: "Test",
      enabled: true,
      deprecated: false,
      source: "https://example.test",
      keywords: [],
      pricing: {},
      llm: { webSearch: true, thinking: { high: { effort: "high" } } },
    },
  ],
};

describe("initial revision admission", () => {
  it("records exact requests and a secret-free deferred settings snapshot once", async () => {
    const h = revisionFixture();
    try {
      const config = {
        ...h.config,
        llm: { provider: "openrouter", model: "test", thinking: "high" },
        sources: { ...h.config.sources, research: "generate", article: "generate" },
        provided: {},
        rendered: { article: "Write a history" },
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
      if (!base.ok) throw new Error("Expected baseline");
      admitInitialRevision(h.deps, base.view, catalogue);
      const works = h.deps.db.prepare("SELECT * FROM revision_work").all();
      const planner = works.find((row) =>
        workPieces(h.deps.db, String(row.id)).some((piece) => piece.key === "research:planner"),
      );
      if (planner === undefined) throw new Error("Missing planner");
      const piece = workPieces(h.deps.db, String(planner.id))[0];
      expect(piece?.input).toMatchObject({ kind: "llm", thinkingConfig: { effort: "high" } });
      expect(
        maySubmit(
          h.deps.db,
          {
            projectId: h.projectId,
            revisionId: base.view.revision.id,
            workId: String(planner.id),
            stageId: "research",
            kind: "research",
            fingerprint: String(planner.fingerprint),
          },
          piece?.id,
        ),
      ).toBe(true);
      expect(JSON.parse(String(planner.recipe_context))).toEqual(catalogue);
      expect(() => admitInitialRevision(h.deps, base.view, catalogue)).toThrow(
        "this project was started twice",
      );
      expect(h.deps.db.prepare("SELECT COUNT(*) AS n FROM revision_work").get()?.n).toBe(
        works.length,
      );
    } finally {
      h.close();
    }
  });
});
