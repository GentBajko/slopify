import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import type { Catalogue } from "../../catalog/schema.js";
import { stageKinds } from "../../kernel/pipeline.js";
import { createRunner } from "../../kernel/runner/index.js";
import { claimWork, finishWork, maySubmit } from "../../kernel/runner/work-authority.js";
import { sourceOf } from "../admission/model.js";
import { failedSteps } from "../agents/attention-work.js";
import { adoptBaseline } from "../revisions/adopt.js";
import { saveRevision } from "../revisions/mutations.js";
import { revisionFixture } from "../revisions/revision.fake.js";
import { admitPendingRevision } from "./legacy-admission.fake.js";
import { admitInitialRevision } from "./runtime-admission.js";
import {
  executionStages,
  executionStandings,
  projectStandings,
  recordWorkProgress,
} from "./runtime-store.js";
import { workPieces } from "./work-records.js";

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

it("counts only spoken narration pieces on the Audio meter", () => {
  const h = revisionFixture();
  try {
    const config = {
      ...h.config,
      sources: { ...h.config.sources, audio: "generate" as const },
      audio: { provider: "openai-tts", model: "test", voice: "voice" },
    };
    h.deps.db
      .prepare("UPDATE projects SET config=? WHERE id=?")
      .run(JSON.stringify(config), h.projectId);
    for (const kind of stageKinds)
      h.deps.db
        .prepare("INSERT INTO stages(id,project_id,kind,source,state) VALUES (?,?,?,?,?)")
        .run(kind, h.projectId, kind, sourceOf(config.sources, kind), "pending");
    const base = adoptBaseline(h.deps, h.projectId);
    if (!base.ok) throw new Error("Missing baseline");
    admitInitialRevision(h.deps, base.view, catalogue);
    const keys = executionStages(h.deps, h.projectId)
      .filter((row) => row.kind === "audio")
      .flatMap((row) => workPieces(h.deps.db, row.work.workId).map((piece) => piece.key));
    // The join is a step of its own, not a chunk: "chunk 1 of 1", not "of 2".
    expect(keys).toContain("audio:body:concat");
    expect(keys).toHaveLength(2);
    projectStandings(h.deps, h.projectId);
    expect(
      h.deps.db
        .prepare("SELECT progress_current,progress_total FROM stages WHERE id='audio'")
        .get(),
    ).toMatchObject({ progress_current: 0, progress_total: 1 });
  } finally {
    h.close();
  }
});

// A failed stage keeps the moment it first failed: needs_attention tells a narration retry
// started after that failure (still going) from one started before it (spent) by it.
it("keeps a stage's first failure time while it stays failed, and a later retry reads as in flight", () => {
  const h = revisionFixture();
  try {
    let now = "2026-09-10T01:00:00.000Z";
    const deps = { ...h.deps, clock: { ...h.deps.clock, now: () => new Date(now) } };
    for (const kind of stageKinds)
      deps.db
        .prepare(
          "INSERT INTO stages(id,project_id,kind,source,state) VALUES (?,?,?,'generate','pending')",
        )
        .run(kind, h.projectId, kind);
    deps.db.prepare("UPDATE projects SET config=? WHERE id=?").run(
      JSON.stringify({
        ...h.config,
        sources: { ...h.config.sources, audio: "generate" },
        audio: { provider: "voice", model: "tts", voice: "v1" },
      }),
      h.projectId,
    );
    const base = adoptBaseline(deps, h.projectId);
    if (!base.ok) throw new Error("Missing baseline");
    admitInitialRevision(deps, base.view, catalogue);
    // The audio export, which a narration chunk's retry answers like the narration's own.
    const work = executionStages(deps, h.projectId).find((row) => row.kind === "video")?.work;
    if (work === undefined) throw new Error("Missing work");
    const failedAt = () =>
      deps.db.prepare("SELECT state,finished_at FROM stages WHERE id='video'").get();
    deps.db
      .prepare(
        "UPDATE revision_work SET state='failed',failure_reason='Chunk 5 misread.' WHERE id=?",
      )
      .run(work.workId);
    projectStandings(deps, h.projectId);
    expect(failedAt()).toEqual({ state: "failed", finished_at: "2026-09-10T01:00:00.000Z" });
    // Read again later, still failed: the first failure's time stays.
    now = "2026-09-10T01:05:00.000Z";
    projectStandings(deps, h.projectId);
    expect(failedAt()).toEqual({ state: "failed", finished_at: "2026-09-10T01:00:00.000Z" });
    const inFlight = () =>
      failedSteps(deps.db, () => undefined).find((entry) => entry.stage === "video")
        ?.autoRetryInFlight;
    const retry = (at: string) =>
      deps.db
        .prepare(
          "INSERT INTO narration_retries(project_id,chunk_key,tries,state,updated_at) VALUES (?,'audio:chunk:5',1,'started',?) ON CONFLICT(project_id,chunk_key) DO UPDATE SET updated_at=excluded.updated_at",
        )
        .run(h.projectId, at);
    // Started before the failure: that retry is spent, so the agent may act.
    retry("2026-09-10T00:59:00.000Z");
    expect(inFlight()).toBe(false);
    // Started after it: still going, so the agent leaves it alone.
    retry("2026-09-10T01:02:00.000Z");
    expect(inFlight()).toBe(true);
    // Run again and failed anew: that failure's own time.
    deps.db.prepare("UPDATE revision_work SET state='running' WHERE id=?").run(work.workId);
    projectStandings(deps, h.projectId);
    expect(failedAt()).toEqual({ state: "running", finished_at: null });
    now = "2026-09-10T01:10:00.000Z";
    deps.db.prepare("UPDATE revision_work SET state='failed' WHERE id=?").run(work.workId);
    projectStandings(deps, h.projectId);
    expect(failedAt()).toEqual({ state: "failed", finished_at: "2026-09-10T01:10:00.000Z" });
  } finally {
    h.close();
  }
});

// The run length on a project's title row, the time left on a running step and the usual time a
// step takes all read when a stage started and when it finished.
it("records when a stage starts and keeps when it finished, through a retry wait and a later save", () => {
  const h = revisionFixture();
  try {
    let now = "2026-09-10T01:00:00.000Z";
    const deps = { ...h.deps, clock: { ...h.deps.clock, now: () => new Date(now) } };
    for (const kind of stageKinds)
      deps.db
        .prepare(
          "INSERT INTO stages(id,project_id,kind,source,state) VALUES (?,?,?,'generate','pending')",
        )
        .run(kind, h.projectId, kind);
    deps.db.prepare("UPDATE projects SET config=? WHERE id=?").run(
      JSON.stringify({
        ...h.config,
        sources: { ...h.config.sources, audio: "generate" },
        audio: { provider: "voice", model: "tts", voice: "v1" },
      }),
      h.projectId,
    );
    const base = adoptBaseline(deps, h.projectId);
    if (!base.ok) throw new Error("Missing baseline");
    admitInitialRevision(deps, base.view, catalogue);
    const work = executionStages(deps, h.projectId).find((row) => row.kind === "video")?.work;
    if (work === undefined) throw new Error("Missing work");
    const times = () =>
      deps.db.prepare("SELECT state,started_at,finished_at FROM stages WHERE id='video'").get();
    const workState = (state: string, retryAt: string | null = null) =>
      deps.db
        .prepare("UPDATE revision_work SET state=?,retry_at=? WHERE id=?")
        .run(state, retryAt, work.workId);
    projectStandings(deps, h.projectId);
    expect(times()).toMatchObject({ state: "pending", started_at: null, finished_at: null });
    workState("running");
    projectStandings(deps, h.projectId);
    expect(times()).toEqual({
      state: "running",
      started_at: "2026-09-10T01:00:00.000Z",
      finished_at: null,
    });
    // Still running a minute later, then waiting to try again: the start stays.
    now = "2026-09-10T01:01:00.000Z";
    projectStandings(deps, h.projectId);
    workState("pending", "2026-09-10T01:02:00.000Z");
    projectStandings(deps, h.projectId);
    workState("running");
    now = "2026-09-10T01:02:00.000Z";
    projectStandings(deps, h.projectId);
    expect(times()).toMatchObject({ started_at: "2026-09-10T01:00:00.000Z" });
    now = "2026-09-10T01:04:00.000Z";
    workState("done");
    projectStandings(deps, h.projectId);
    expect(times()).toEqual({
      state: "done",
      started_at: "2026-09-10T01:00:00.000Z",
      finished_at: "2026-09-10T01:04:00.000Z",
    });
    // Read again much later (a rename's save does this): neither moment moves.
    now = "2026-09-12T09:00:00.000Z";
    projectStandings(deps, h.projectId);
    expect(times()).toMatchObject({
      started_at: "2026-09-10T01:00:00.000Z",
      finished_at: "2026-09-10T01:04:00.000Z",
    });
    // Made again: a new start.
    workState("running");
    projectStandings(deps, h.projectId);
    expect(times()).toEqual({
      state: "running",
      started_at: "2026-09-12T09:00:00.000Z",
      finished_at: null,
    });
  } finally {
    h.close();
  }
});

// A stage of several steps (the narration's chunk, then its join) is between steps for a moment
// while one has finished and the next is not claimed yet: it keeps the start it took.
it("keeps a stage's start between its steps", () => {
  const h = revisionFixture();
  try {
    let now = "2026-09-10T01:00:00.000Z";
    const deps = { ...h.deps, clock: { ...h.deps.clock, now: () => new Date(now) } };
    for (const kind of stageKinds)
      deps.db
        .prepare(
          "INSERT INTO stages(id,project_id,kind,source,state) VALUES (?,?,?,'generate','pending')",
        )
        .run(kind, h.projectId, kind);
    deps.db.prepare("UPDATE projects SET config=? WHERE id=?").run(
      JSON.stringify({
        ...h.config,
        sources: { ...h.config.sources, audio: "generate" },
        audio: { provider: "voice", model: "tts", voice: "v1" },
      }),
      h.projectId,
    );
    const base = adoptBaseline(deps, h.projectId);
    if (!base.ok) throw new Error("Missing baseline");
    admitInitialRevision(deps, base.view, catalogue);
    const steps = executionStages(deps, h.projectId).filter((row) => row.kind === "audio");
    expect(steps.length).toBeGreaterThan(1);
    const times = () =>
      deps.db.prepare("SELECT state,started_at,finished_at FROM stages WHERE id='audio'").get();
    const step = (index: number, state: string) =>
      deps.db
        .prepare("UPDATE revision_work SET state=? WHERE id=?")
        .run(state, steps[index]?.work.workId ?? "");
    step(0, "running");
    projectStandings(deps, h.projectId);
    now = "2026-09-10T01:02:00.000Z";
    step(0, "done");
    projectStandings(deps, h.projectId);
    expect(times()).toEqual({
      state: "pending",
      started_at: "2026-09-10T01:00:00.000Z",
      finished_at: null,
    });
    now = "2026-09-10T01:03:00.000Z";
    for (let index = 1; index < steps.length; index++) step(index, "running");
    projectStandings(deps, h.projectId);
    expect(times()).toMatchObject({ state: "running", started_at: "2026-09-10T01:00:00.000Z" });
    now = "2026-09-10T01:05:00.000Z";
    for (let index = 1; index < steps.length; index++) step(index, "done");
    projectStandings(deps, h.projectId);
    expect(times()).toEqual({
      state: "done",
      started_at: "2026-09-10T01:00:00.000Z",
      finished_at: "2026-09-10T01:05:00.000Z",
    });
  } finally {
    h.close();
  }
});
