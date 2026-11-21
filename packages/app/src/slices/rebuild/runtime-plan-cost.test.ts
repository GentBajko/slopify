import { rmSync } from "node:fs";
import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import { afterEach, expect, it, vi } from "vitest";
import { pronunciationMatches } from "../narration/pronunciation.js";
import { saveRevision } from "../revisions/mutations.js";
import { outputPath } from "../storage/layout.js";
import { admitPendingRevision } from "./legacy-admission.fake.js";
import { retainedNarrationPieces } from "./narration-history.js";
import { narrationCatalogue, narrationFixture } from "./runtime-narration.fake.js";
import { executionPlan, executionView, forgetPlanInputs } from "./runtime-plan.js";

// Every finished step (each picture, each check, each narration chunk) writes to the
// database, so the plan is derived again after every one of them: some 500 times a video, a
// dozen videos at once. What each derivation reads must cost what changed, not what the whole
// database holds: on a 4 GB database the narration history and joins were read by scanning
// every saved piece, and every retained narration chunk's record was read and parsed again.

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const close of cleanups.splice(0)) close();
  vi.restoreAllMocks();
});

interface Read {
  readonly sql: string;
  readonly params: readonly SQLInputValue[];
  readonly rows: readonly Record<string, unknown>[];
}

// Every statement the database runs and the rows it hands back, until `stop` is called.
function watchReads(db: DatabaseSync): { readonly reads: Read[]; readonly stop: () => void } {
  const reads: Read[] = [];
  const prepare = db.prepare.bind(db);
  const watched = (sql: string) => {
    const statement = prepare(sql);
    const all = statement.all.bind(statement);
    const get = statement.get.bind(statement);
    return Object.assign(statement, {
      all: (...params: SQLInputValue[]) => {
        const rows = all(...params);
        reads.push({ sql, params, rows });
        return rows;
      },
      get: (...params: SQLInputValue[]) => {
        const row = get(...params);
        reads.push({ sql, params, rows: row === undefined ? [] : [row] });
        return row;
      },
    });
  };
  Object.defineProperty(db, "prepare", { value: watched, configurable: true, writable: true });
  return {
    reads,
    stop: () => {
      delete (db as unknown as { prepare?: unknown }).prepare;
    },
  };
}

// A project whose narration was voiced three times over (three voices), so its history holds
// more chunks than its current version.
async function voicedThrice() {
  const h = await narrationFixture("one\n\ntwo\n\nthree\n\nfour");
  cleanups.push(h.close);
  await h.pump();
  for (const voice of ["second", "third"]) {
    const base = h.view();
    const saved = await saveRevision(h.deps, {
      projectId: h.projectId,
      baseRevisionId: base.revision.id,
      idempotencyKey: voice,
      edit: {
        config: { ...base.revision.config, audio: { provider: "openai-tts", model: "tts", voice } },
        content: base.revision.content,
      },
    });
    if (!saved.ok) throw new Error(JSON.stringify(saved));
    admitPendingRevision(h.deps, saved.view, narrationCatalogue);
    await h.pump();
  }
  const view = executionView(h.deps, h.projectId, h.view().revision.id);
  if (view === undefined) throw new Error("no view");
  return { ...h, executionView: view };
}

const descriptorChars = (reads: readonly Read[]): number =>
  reads
    .flatMap((read) => read.rows)
    .reduce(
      (sum, row) => sum + (typeof row.descriptor === "string" ? row.descriptor.length : 0),
      0,
    );

it("never scans every saved piece or output of the database to plan", async () => {
  const h = await voicedThrice();
  const watch = watchReads(h.deps.db);
  h.deps.db.prepare("UPDATE projects SET config=config WHERE id=?").run(h.projectId);
  executionPlan(h.deps, h.executionView, narrationCatalogue);
  watch.stop();
  const scans = watch.reads
    .filter((read) => /revision_pieces|revision_outputs/u.test(read.sql))
    .flatMap((read) =>
      h.deps.db
        .prepare(`EXPLAIN QUERY PLAN ${read.sql}`)
        .all(...read.params)
        .map((row) => String(row.detail))
        .filter((detail) => /^SCAN (revision_pieces|revision_outputs|p|o)\b/u.test(detail))
        .map((detail) => `${detail} in ${read.sql}`),
    );
  expect(scans).toEqual([]);
});

it("reads each retained narration chunk's record once, however often the plan is derived", async () => {
  const h = await voicedThrice();
  forgetPlanInputs(h.deps.db);
  const first = watchReads(h.deps.db);
  const history = retainedNarrationPieces(h.deps, h.projectId);
  first.stop();
  expect(history.length).toBeGreaterThan(4);
  expect(descriptorChars(first.reads)).toBeGreaterThan(0);

  const again = watchReads(h.deps.db);
  for (let step = 0; step < 10; step++) {
    // A finished step elsewhere: a write the history doesn't hold.
    h.deps.db.prepare("UPDATE projects SET config=config WHERE id=?").run(h.projectId);
    expect(retainedNarrationPieces(h.deps, h.projectId)).toEqual(history);
  }
  again.stop();
  expect(descriptorChars(again.reads)).toBe(0);
});

it("derives the same plan from remembered inputs as from fresh ones", async () => {
  const h = await voicedThrice();
  executionPlan(h.deps, h.executionView, narrationCatalogue);
  h.deps.db.prepare("UPDATE projects SET config=config WHERE id=?").run(h.projectId);
  const remembered = executionPlan(h.deps, h.executionView, narrationCatalogue);
  forgetPlanInputs(h.deps.db);
  h.deps.db.prepare("UPDATE projects SET config=config WHERE id=?").run(h.projectId);
  const fresh = executionPlan(h.deps, h.executionView, narrationCatalogue);
  expect(fresh).not.toBe(remembered);
  expect(remembered).toEqual(fresh);
});

it("sees a narration chunk added to the history", async () => {
  const h = await voicedThrice();
  const before = retainedNarrationPieces(h.deps, h.projectId);
  const row = h.deps.db
    .prepare(
      "SELECT * FROM revision_pieces WHERE project_id=? AND stage_kind='audio' AND asset_id IS NOT NULL ORDER BY created_at DESC,id DESC LIMIT 1",
    )
    .get(h.projectId);
  if (row === undefined) throw new Error("no narration piece");
  const descriptor = JSON.parse(String(row.descriptor));
  h.deps.db
    .prepare(
      `INSERT INTO revision_pieces (id,project_id,revision_id,piece_key,stage_kind,asset_id,fingerprint,descriptor,publication_id,selected,created_at)
       VALUES ('zz-added',?,?,?,'audio',?,'fp-added',?,NULL,0,'2999-01-01T00:00:00.000Z')`,
    )
    .run(
      h.projectId,
      String(row.revision_id),
      "audio:body:added",
      String(row.asset_id),
      JSON.stringify({ ...descriptor, id: "zz-piece" }),
    );
  const after = retainedNarrationPieces(h.deps, h.projectId);
  expect(after).toHaveLength(before.length + 1);
  expect(after.at(-1)).toMatchObject({
    key: "audio:body:added",
    fingerprint: "fp-added",
    piece: { id: "zz-piece" },
  });
});

it("sees a narration chunk removed from the history, and a file gone from disk", async () => {
  const h = await voicedThrice();
  const before = retainedNarrationPieces(h.deps, h.projectId);
  const gone = before[0];
  if (gone === undefined) throw new Error("no history");
  h.deps.db
    .prepare(
      "DELETE FROM revision_pieces WHERE project_id=? AND stage_kind='audio' AND piece_key=? AND fingerprint=? AND asset_id=?",
    )
    .run(h.projectId, gone.key, gone.fingerprint, gone.assetId);
  const after = retainedNarrationPieces(h.deps, h.projectId);
  expect(after.some((one) => one.piece.id === gone.piece.id)).toBe(false);
  const kept = after[0];
  if (kept === undefined || kept.assetId === null) throw new Error("no history left");
  expect(kept.available).toBe(true);
  const path = h.deps.db
    .prepare("SELECT path FROM project_assets WHERE id=?")
    .get(kept.assetId)?.path;
  rmSync(outputPath(h.deps.paths, h.projectId, String(path)));
  const deleted = retainedNarrationPieces(h.deps, h.projectId).find(
    (one) => one.piece.id === kept.piece.id,
  );
  expect(deleted?.available).toBe(false);
});

it("matches a narration against its glossary without serialising the glossary each time", () => {
  const entries = [
    { term: "Vorn", ipa: ["vɔːrn"] },
    { term: "Kel Dara", ipa: ["kɛl", "ˈdɑːrə"] },
  ];
  const source = "Vorn walked to Kel Dara. ".repeat(2000);
  pronunciationMatches(source, entries);
  const stringify = vi.spyOn(JSON, "stringify");
  for (let call = 0; call < 200; call++) pronunciationMatches(source, entries, call % 2 === 0);
  expect(stringify).not.toHaveBeenCalled();
});

it("tells two glossaries apart over the same narration, and knows one glossary in a new array", () => {
  const source = "Vorn walked to Kel Dara's gate, and Kel Dara slept.";
  const one = [{ term: "Vorn", ipa: ["vɔːrn"] }];
  const two = [{ term: "Kel Dara", ipa: ["kɛl", "ˈdɑːrə"] }];
  expect(pronunciationMatches(source, one).map((match) => match.entry.term)).toEqual(["Vorn"]);
  expect(pronunciationMatches(source, two).map((match) => match.entry.term)).toEqual(["Kel Dara"]);
  expect(pronunciationMatches(source, two, true).map((match) => match.possessive)).toEqual([
    "'s",
    undefined,
  ]);
  expect(pronunciationMatches(source, two, false).map((match) => match.possessive)).toEqual([
    undefined,
  ]);
  // Same glossary, another array: the same answer.
  expect(pronunciationMatches(source, [{ term: "Vorn", ipa: ["vɔːrn"] }])).toEqual(
    pronunciationMatches(source, one),
  );
  // An array changed in place is a different glossary (never done, but never wrong either).
  const mutable = [{ term: "Vorn", ipa: ["vɔːrn"] }];
  expect(pronunciationMatches(source, mutable)).toHaveLength(1);
  mutable.push({ term: "Kel Dara", ipa: ["kɛl", "ˈdɑːrə"] });
  expect(pronunciationMatches(source, mutable)).toHaveLength(2);
});
