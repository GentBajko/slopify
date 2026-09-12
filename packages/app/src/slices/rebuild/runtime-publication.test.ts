import { readdirSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { stageKinds } from "../../kernel/pipeline.js";
import type { StageContext } from "../../kernel/runner/index.js";
import { adoptBaseline } from "../revisions/adopt.js";
import { revisionFixture } from "../revisions/revision.fake.js";
import { admitInitialRevision } from "./runtime-admission.js";
import { preparedTexts } from "./runtime-publication.js";
import { executionStages } from "./runtime-store.js";
import { workPieces } from "./work-records.js";

it("removes earlier unregistered text assets if preparing a later bundle member fails", () => {
  const h = revisionFixture();
  try {
    for (const kind of stageKinds)
      h.deps.db
        .prepare(
          "INSERT INTO stages(id,project_id,kind,source,state) VALUES (?,?,?,'generate','pending')",
        )
        .run(kind, h.projectId, kind);
    const base = adoptBaseline(h.deps, h.projectId);
    if (!base.ok) throw new Error("Missing baseline");
    admitInitialRevision(h.deps, base.view, {
      schemaVersion: 1,
      updatedAt: "2026-09-12",
      providers: {},
      llm: [],
      tts: [],
      image: [],
    });
    const stage = executionStages(h.deps, h.projectId).find((row) => row.kind === "article");
    if (stage === undefined) throw new Error("Missing work");
    const piece = workPieces(h.deps.db, stage.work.workId)[0];
    if (piece === undefined) throw new Error("Missing piece");
    const context: StageContext = {
      stage,
      work: stage.work,
      signal: new AbortController().signal,
      maySubmit: () => true,
      emit: () => {},
    };
    let allocations = 0;
    const deps = {
      ...h.deps,
      ids: {
        next: () => {
          allocations += 1;
          if (allocations === 3) throw new Error("Allocation failed");
          return `allocated-${allocations}`;
        },
      },
    };
    expect(() =>
      preparedTexts(deps, context, piece, [
        ["article_md", "article.md", "Article"],
        ["article_txt", "article.txt", "Article"],
      ]),
    ).toThrow("Allocation failed");
    expect(readdirSync(join(deps.paths.projects, h.projectId, "assets"))).toEqual([]);
    expect(deps.db.prepare("SELECT COUNT(*) n FROM project_assets").get()?.n).toBe(0);
  } finally {
    h.close();
  }
});
