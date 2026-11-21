import { rmSync, writeFileSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { afterEach, expect, it } from "vitest";
import type { RevisionView } from "../revisions/model.js";
import { saveRevision } from "../revisions/mutations.js";
import { outputPath } from "../storage/layout.js";
import { admitPendingRevision } from "./legacy-admission.fake.js";
import { narrationCatalogue, narrationFixture } from "./runtime-narration.fake.js";
import { executionPlan, executionView, forgetPlanInputs } from "./runtime-plan.js";

// The plan is kept while what it is derived from is unchanged (`runtime-plan.ts`), and no
// longer thrown away on every write to the database. Each input is changed here in turn: the
// plan must be derived again, and say what a plan derived from scratch says.

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const close of cleanups.splice(0)) close();
});

async function voicedTwice() {
  const h = await narrationFixture("one\n\ntwo\n\nthree");
  cleanups.push(h.close);
  await h.pump();
  const base = h.view();
  const saved = await saveRevision(h.deps, {
    projectId: h.projectId,
    baseRevisionId: base.revision.id,
    idempotencyKey: "second",
    edit: {
      config: {
        ...base.revision.config,
        audio: { provider: "openai-tts", model: "tts", voice: "second" },
      },
      content: base.revision.content,
    },
  });
  if (!saved.ok) throw new Error(JSON.stringify(saved));
  admitPendingRevision(h.deps, saved.view, narrationCatalogue);
  await h.pump();
  const current = (): RevisionView => {
    const view = executionView(h.deps, h.projectId, h.view().revision.id);
    if (view === undefined) throw new Error("no view");
    return view;
  };
  return { ...h, earlier: base.revision.id, current };
}

// The plan kept or derived now, checked against one derived from fresh reads.
function planNow(h: Awaited<ReturnType<typeof voicedTwice>>, view = h.current()) {
  const plan = executionPlan(h.deps, view, narrationCatalogue);
  forgetPlanInputs(h.deps.db);
  expect(executionPlan(h.deps, view, narrationCatalogue)).toEqual(plan);
  return plan;
}

function cloneRow(db: DatabaseSync, table: string, where: string, args: readonly string[]) {
  const row = db.prepare(`SELECT * FROM ${table} WHERE ${where} LIMIT 1`).get(...args);
  if (row === undefined) throw new Error(`no ${table} row`);
  return row;
}

it("reads nothing from the database that its key doesn't cover", async () => {
  const h = await voicedTwice();
  const view = h.current();
  forgetPlanInputs(h.deps.db);
  const tables = new Set<string>();
  const prepare = h.deps.db.prepare.bind(h.deps.db);
  Object.defineProperty(h.deps.db, "prepare", {
    configurable: true,
    writable: true,
    value: (sql: string) => {
      for (const match of sql.matchAll(/\b(?:FROM|JOIN)\s+(\w+)/giu))
        if (match[1] !== undefined) tables.add(match[1]);
      return prepare(sql);
    },
  });
  try {
    executionPlan(h.deps, view, narrationCatalogue);
  } finally {
    delete (h.deps.db as unknown as { prepare?: unknown }).prepare;
  }
  // `planInputs` in runtime-plan.ts reads these, and the key marks what it read of each. A new
  // read belongs there, in the key, and here.
  expect([...tables].sort()).toEqual(
    ["project_assets", "revision_outputs", "revision_pieces", "revision_provided_reviews"].sort(),
  );
});

it("is kept through writes that change none of its inputs", async () => {
  const h = await voicedTwice();
  const view = h.current();
  const before = executionPlan(h.deps, view, narrationCatalogue);
  h.deps.db.prepare("UPDATE projects SET config=config WHERE id=?").run(h.projectId);
  h.deps.db.prepare("UPDATE revision_work SET progress_current=1").run();
  expect(executionPlan(h.deps, view, narrationCatalogue)).toBe(before);
});

it("is derived again when the narration history gains a chunk", async () => {
  const h = await voicedTwice();
  const before = planNow(h);
  const row = cloneRow(h.deps.db, "revision_pieces", "revision_id=? AND stage_kind='audio'", [
    h.earlier,
  ]);
  h.deps.db
    .prepare(
      `INSERT INTO revision_pieces (id,project_id,revision_id,piece_key,stage_kind,asset_id,fingerprint,descriptor,publication_id,selected,created_at)
       VALUES ('zz-history',?,?,'audio:body:other','audio',?,'fp-other',?,NULL,0,?)`,
    )
    .run(
      h.projectId,
      h.earlier,
      row.asset_id as string | null,
      String(row.descriptor),
      String(row.created_at),
    );
  expect(planNow(h)).not.toBe(before);
});

it("is derived again when an earlier version's narration file is gone from disk", async () => {
  const h = await voicedTwice();
  // A chunk only the history holds, with a file of its own.
  const row = cloneRow(h.deps.db, "revision_pieces", "revision_id=? AND stage_kind='audio'", [
    h.earlier,
  ]);
  h.deps.db
    .prepare(
      "INSERT INTO project_assets (id,project_id,path,bytes,created_at) VALUES ('zz-asset',?,'zz-history.mp3',4,?)",
    )
    .run(h.projectId, String(row.created_at));
  const file = outputPath(h.deps.paths, h.projectId, "zz-history.mp3");
  writeFileSync(file, "mp3!");
  h.deps.db
    .prepare(
      `INSERT INTO revision_pieces (id,project_id,revision_id,piece_key,stage_kind,asset_id,fingerprint,descriptor,publication_id,selected,created_at)
       VALUES ('zz-history',?,?,'audio:body:other','audio','zz-asset','fp-other',?,NULL,0,?)`,
    )
    .run(h.projectId, h.earlier, String(row.descriptor), String(row.created_at));
  const before = planNow(h);
  rmSync(file);
  expect(planNow(h)).not.toBe(before);
});

it("is derived again when a narration join is recorded", async () => {
  const h = await voicedTwice();
  const before = planNow(h);
  const row = cloneRow(h.deps.db, "revision_outputs", "project_id=? AND work_key LIKE 'audio:%'", [
    h.projectId,
  ]);
  h.deps.db
    .prepare(
      `INSERT INTO revision_outputs (id,project_id,revision_id,slot,work_key,asset_id,fingerprint,state,descriptor,publication_id,selected,created_at)
       VALUES ('zz-join',?,?,'zz-slot','audio:intro',?,'fp-join','ready',?,NULL,0,?)`,
    )
    .run(
      h.projectId,
      h.earlier,
      String(row.asset_id),
      String(row.descriptor),
      String(row.created_at),
    );
  expect(planNow(h)).not.toBe(before);
});

it("is derived again when provided content is reviewed", async () => {
  const h = await voicedTwice();
  const view = h.current();
  const before = planNow(h, view);
  // The review's admission doesn't matter to the plan: only that the review is saved.
  h.deps.db.exec("PRAGMA foreign_keys=OFF");
  h.deps.db
    .prepare(
      "INSERT INTO revision_provided_reviews(project_id,revision_id,work_key,dependency_fingerprint,admission_id) VALUES (?,?,'audio:provided','fp','zz-admission')",
    )
    .run(h.projectId, view.revision.id);
  h.deps.db.exec("PRAGMA foreign_keys=ON");
  expect(planNow(h, view)).not.toBe(before);
});

it("is derived again when the article changes, even to one of the same length", async () => {
  const h = await voicedTwice();
  const view = h.current();
  const before = planNow(h, view);
  const article = view.articleMarkdown ?? "";
  const changed = { ...view, articleMarkdown: article.replace("one", "won") };
  expect(changed.articleMarkdown).toHaveLength(article.length);
  expect(changed.articleMarkdown).not.toBe(article);
  expect(planNow(h, changed)).not.toBe(before);
});

it("is derived again when the version's settings change in place", async () => {
  const h = await voicedTwice();
  const view = h.current();
  const before = planNow(h, view);
  const changed = {
    ...view,
    revision: {
      ...view.revision,
      config: { ...view.revision.config, chunking: { mode: "whole" as const } },
    },
  };
  const after = planNow(h, changed);
  expect(after).not.toBe(before);
  expect(after.recipes.map((one) => one.key)).not.toEqual(before.recipes.map((one) => one.key));
});

it("is derived again when a file of the version is gone from disk", async () => {
  const h = await voicedTwice();
  const before = planNow(h);
  const piece = h.current().pieces.find((one) => one.selected && one.assetId !== null);
  if (piece?.assetId === undefined || piece.assetId === null) throw new Error("no file");
  const path = h.deps.db
    .prepare("SELECT path FROM project_assets WHERE id=?")
    .get(piece.assetId)?.path;
  rmSync(outputPath(h.deps.paths, h.projectId, String(path)));
  const after = planNow(h);
  expect(after).not.toBe(before);
  expect(after.work).not.toEqual(before.work);
});
