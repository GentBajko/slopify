import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import type { Catalogue } from "../../catalog/schema.js";
import { stageKinds } from "../../kernel/pipeline.js";
import { createRunner } from "../../kernel/runner/index.js";
import { claimWork, finishWork, maySubmit } from "../../kernel/runner/work-authority.js";
import { adoptBaseline } from "../revisions/adopt.js";
import { saveRevision } from "../revisions/mutations.js";
import { revisionFixture } from "../revisions/revision.fake.js";
import { admitPendingRevision } from "./legacy-admission.fake.js";
import { admitInitialRevision } from "./runtime-admission.js";
import { executionStages, executionStandings, recordWorkProgress } from "./runtime-store.js";
import { sourceOf } from "../admission/model.js";

const catalogue: Catalogue = {
  schemaVersion: 1,
  updatedAt: "2026-09-12",
  providers: {},
  llm: [],
  tts: [],
  image: [],
};

it("keeps an adopted completed article satisfied after title Save and Resume", async () => {
  const h = revisionFixture();
  try {
    for (const kind of stageKinds)
      h.deps.db
        .prepare("INSERT INTO stages(id,project_id,kind,source,state) VALUES (?,?,?,? ,?)")
        .run(
          kind,
          h.projectId,
          kind,
          sourceOf(h.config.sources, kind),
          kind === "article" ? "provided" : "skipped",
        );
    writeFileSync(
      join(h.deps.paths.projects, h.projectId, "article.txt"),
      h.config.provided.article ?? "",
    );
    h.deps.db
      .prepare(
        "INSERT INTO outputs(id,project_id,stage_kind,role,path,bytes,meta,created_at) VALUES ('text',?,'article','article_txt','article.txt',14,'{}','today')",
      )
      .run(h.projectId);
    const base = adoptBaseline(h.deps, h.projectId);
    if (!base.ok) throw new Error("Missing baseline");
    const saved = await saveRevision(h.deps, {
      projectId: h.projectId,
      baseRevisionId: base.view.revision.id,
      idempotencyKey: "title",
      edit: { config: { ...h.config, title: "Renamed" }, content: base.view.revision.content },
    });
    if (!saved.ok) throw new Error(JSON.stringify(saved));
    admitPendingRevision(h.deps, saved.view, catalogue);
    expect(
      executionStandings(h.deps, h.projectId).find((row) => row.kind === "article")?.state,
    ).toBe("provided");
    expect(executionStages(h.deps, h.projectId).some((row) => row.state === "pending")).toBe(false);
    expect(
      h.deps.db.prepare("SELECT COUNT(*) n FROM revision_work WHERE dispatch_state='allowed'").get()
        ?.n,
    ).toBe(0);
  } finally {
    h.close();
  }
});

it("keeps deferred narration in the total standing before concrete parts exist", () => {
  const h = revisionFixture();
  try {
    const config = {
      ...h.config,
      sources: { ...h.config.sources, article: "generate", audio: "generate" },
      llm: { provider: "openrouter", model: "test" },
      audio: { provider: "openai-tts", model: "test", voice: "voice" },
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
    const base = adoptBaseline(h.deps, h.projectId);
    if (!base.ok) throw new Error("Missing baseline");
    admitInitialRevision(h.deps, base.view, catalogue);
    h.deps.db
      .prepare(
        "UPDATE revision_work SET state='done' WHERE kind='audio' AND id IN(SELECT work_id FROM revision_work_pieces WHERE json_extract(input_json,'$.kind')!='deferred')",
      )
      .run();
    expect(executionStandings(h.deps, h.projectId).find((row) => row.kind === "audio")?.state).toBe(
      "pending",
    );
  } finally {
    h.close();
  }
});

it("persists fractional current progress without letting retired work paint its replacement", async () => {
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
    admitInitialRevision(h.deps, base.view, catalogue);
    const work = executionStages(h.deps, h.projectId).find((row) => row.kind === "article")?.work;
    if (work === undefined) throw new Error("Missing work");
    h.deps.db.prepare("UPDATE revision_work SET state='running' WHERE id=?").run(work.workId);
    recordWorkProgress(h.deps, {
      type: "stage.progress",
      projectId: h.projectId,
      revisionId: work.revisionId,
      workId: work.workId,
      stage: "article",
      current: 3,
      total: 4,
    });
    expect(
      h.deps.db
        .prepare("SELECT progress_current,progress_total FROM stages WHERE id='article'")
        .get(),
    ).toMatchObject({ progress_current: 0.75, progress_total: 1 });
    recordWorkProgress(h.deps, {
      type: "stage.progress",
      projectId: h.projectId,
      revisionId: work.revisionId,
      workId: work.workId,
      stage: "article",
      current: 1,
      total: 4,
    });
    // Later reports adjust the counted row by their difference instead of re-deriving it.
    expect(
      h.deps.db
        .prepare("SELECT progress_current,progress_total FROM stages WHERE id='article'")
        .get(),
    ).toMatchObject({ progress_current: 0.25, progress_total: 1 });
    const saved = await saveRevision(h.deps, {
      projectId: h.projectId,
      baseRevisionId: base.view.revision.id,
      idempotencyKey: "text",
      edit: {
        config: h.config,
        content: {
          ...base.view.revision.content,
          articleMarkdown: "A different article.",
          articleEdited: true,
        },
      },
    });
    if (!saved.ok) throw new Error(JSON.stringify(saved));
    recordWorkProgress(h.deps, {
      type: "stage.progress",
      projectId: h.projectId,
      revisionId: work.revisionId,
      workId: work.workId,
      stage: "article",
      current: 4,
      total: 4,
    });
    expect(
      h.deps.db
        .prepare("SELECT progress_current,progress_total FROM stages WHERE id='article'")
        .get(),
    ).toMatchObject({ progress_current: 0, progress_total: 1 });
  } finally {
    h.close();
  }
});

it("holds a stopped invocation instead of reclaiming it on the runner's completion tick", async () => {
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
    admitInitialRevision(h.deps, base.view, catalogue);
    let calls = 0;
    const runner = createRunner({
      stages: {
        stagesOf: (id) => executionStages(h.deps, id),
        standingsOf: (id) => executionStandings(h.deps, id),
        ready: () => true,
        claim: (work) => claimWork(h.deps.db, work),
        maySubmit: (work, piece) => maySubmit(h.deps.db, work, piece),
        finish: (work, state, reason) => finishWork(h.deps.db, work, state, reason),
      },
      runs: {
        article: async () => {
          calls += 1;
          if (calls > 1) throw new Error("Held work was reclaimed");
          return "held";
        },
      },
      emit: () => {},
      emitRunningCount: () => {},
      log: h.deps.log,
    });
    runner.tick(h.projectId);
    await runner.settled();
    runner.tick(h.projectId);
    await runner.settled();
    expect(calls).toBe(1);
    expect(
      h.deps.db
        .prepare("SELECT state,dispatch_state FROM revision_work WHERE kind='article'")
        .get(),
    ).toMatchObject({ state: "pending", dispatch_state: "held" });
  } finally {
    h.close();
  }
});
