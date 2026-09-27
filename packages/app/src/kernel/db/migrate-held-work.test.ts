import type { DatabaseSync } from "node:sqlite";
import { expect, it } from "vitest";
import { fixedClock } from "../clock.fake.js";
import { openDb } from "./index.js";
import { migrate } from "./migrate.js";

const clock = fixedClock("2026-09-02T10:00:00.000Z");
const fp64 = "a".repeat(64);

interface Work {
  readonly id: string;
  readonly key: string;
  readonly fp: string;
  readonly revision?: string;
  readonly project?: string;
  readonly state?: "pending" | "running" | "done" | "failed" | "canceled";
  readonly dispatch?: "held" | "allowed" | "draining";
  readonly piece?: "pending" | "running" | "done" | "failed" | "held";
  readonly submitted?: boolean;
  readonly context?: boolean;
  readonly extraPiece?: boolean;
}

function work(db: DatabaseSync, row: Work): void {
  const project = row.project ?? "p1";
  const state = row.state ?? "pending";
  db.prepare(
    `INSERT INTO revision_work (id,project_id,revision_id,stage_id,kind,fingerprint,recipe_context,state,dispatch_state,created_at)
     VALUES (?,?,?,?,'images',?,?,?,?,'old')`,
  ).run(
    row.id,
    project,
    row.revision ?? `${project}-r1`,
    `${project}-images`,
    row.fp,
    row.context === true ? "{}" : null,
    state,
    row.dispatch ?? (state === "pending" ? "held" : "allowed"),
  );
  const piece = (id: string, key: string) =>
    db
      .prepare(
        `INSERT INTO revision_work_pieces (id,work_id,work_key,request_fingerprint,fingerprint,input_json,state,dispatch_state,submitted_at)
         VALUES (?,?,?,?,?,'{}',?,?,?)`,
      )
      .run(
        id,
        row.id,
        key,
        row.fp,
        row.fp,
        row.piece ?? (state === "done" ? "done" : "held"),
        row.dispatch ?? (state === "pending" ? "held" : "allowed"),
        row.submitted === true ? "old" : null,
      );
  piece(`${row.id}-piece`, row.key);
  if (row.extraPiece === true) piece(`${row.id}-extra`, `${row.key}:extra`);
}

function reserve(db: DatabaseSync, revision: string, workId: string, key: string, fp: string) {
  db.prepare(
    "INSERT INTO revision_work_reservations (project_id,revision_id,work_key,work_id,piece_id,fingerprint) VALUES ('p1',?,?,?,?,?)",
  ).run(revision, key, workId, `${workId}-piece`, fp);
}

function fixture(): DatabaseSync {
  const db = openDb(":memory:");
  migrate(db, clock, { through: 19 });
  for (const project of ["p1", "p2"]) {
    db.prepare("INSERT INTO projects VALUES (?,'Saved','16:9','{}','old','old')").run(project);
    db.prepare(
      "INSERT INTO stages (id,project_id,kind,source,state) VALUES (?,?,'images','generate','pending')",
    ).run(`${project}-images`, project);
    for (const n of [1, 2, 3, 4])
      db.prepare("INSERT INTO project_revisions VALUES (?,?,NULL,NULL,'{}','{}','{}','old')").run(
        `${project}-r${n}`,
        project,
      );
    db.prepare("INSERT INTO project_heads VALUES (?,?)").run(project, `${project}-r4`);
  }
  db.exec("INSERT INTO project_assets VALUES ('asset1','p1','images/a.png',10,'old')");
  // A copy of more than one piece is not one step, so it stays.
  work(db, { id: "a-two-pieces", key: "image:a", fp: "fa", extraPiece: true });
  // Repeated saves while waiting: one held copy per save, each reserved by its revision.
  work(db, { id: "a1", key: "image:a", fp: "fa", revision: "p1-r1" });
  work(db, { id: "a2", key: "image:a", fp: "fa", revision: "p1-r2" });
  work(db, { id: "a3", key: "image:a", fp: "fa", revision: "p1-r4" });
  reserve(db, "p1-r1", "a1", "image:a", "fa");
  reserve(db, "p1-r2", "a2", "image:a", "fa");
  reserve(db, "p1-r4", "a3", "image:a", "fa");
  // Copies of image:a that something already touched stay.
  work(db, { id: "a-tried", key: "image:a", fp: "fa" });
  db.exec(
    "INSERT INTO attempts (id,stage_id,n,started_at,work_id) VALUES ('t1','p1-images',1,'old','a-tried')",
  );
  work(db, { id: "a-sent", key: "image:a", fp: "fa", dispatch: "draining", submitted: true });
  work(db, { id: "a-admitted", key: "image:a", fp: "fa", context: true });
  work(db, { id: "a-other-fp", key: "image:a", fp: "fa2" });
  // A finished result and an unreserved held copy of it: the copy goes.
  work(db, { id: "b-done", key: "image:b", fp: "fb", state: "done" });
  work(db, { id: "b-held", key: "image:b", fp: "fb" });
  // A held copy the head reserved beside a finished result stays: moving the head onto the
  // result would change what it shows.
  work(db, { id: "c-done", key: "image:c", fp: "fc", state: "done" });
  work(db, { id: "c-held", key: "image:c", fp: "fc", revision: "p1-r4" });
  reserve(db, "p1-r4", "c-held", "image:c", "fc");
  // The only row for a step.
  work(db, { id: "d-held", key: "image:d", fp: "fd" });
  // Finished twins, and running and failed work, are never removed.
  work(db, { id: "e-done1", key: "image:e", fp: "fe", state: "done" });
  work(db, { id: "e-done2", key: "image:e", fp: "fe", state: "done" });
  work(db, { id: "f-failed", key: "image:f", fp: "ff", state: "failed", piece: "failed" });
  work(db, { id: "f-running", key: "image:f", fp: "ff", state: "running", piece: "running" });
  work(db, { id: "f-held", key: "image:f", fp: "ff" });
  // A copy a review checkpoint points at stays.
  work(db, { id: "g-checked", key: "image:g", fp: "fg", revision: "p1-r3" });
  work(db, { id: "g-held", key: "image:g", fp: "fg" });
  db.prepare(
    "INSERT INTO review_checkpoints (project_id,revision_id,checkpoint_id,stage,work_id,fingerprint,state,created_at) VALUES ('p1','p1-r3','k1','images','g-checked',?,'held','old')",
  ).run(fp64);
  // The same step in another project is that project's own.
  work(db, { id: "p2-held", key: "image:b", fp: "fb", project: "p2" });
  return db;
}

function ids(db: DatabaseSync): string[] {
  return db
    .prepare("SELECT id FROM revision_work ORDER BY id")
    .all()
    .map((row) => String(row.id));
}

it("removes the held copies an older save left beside the row Save now reuses", () => {
  const db = fixture();
  try {
    const before = ids(db);

    migrate(db, clock);

    expect(ids(db)).toEqual(before.filter((id) => !["a1", "a2", "b-held"].includes(id)));
    expect(
      db
        .prepare(
          "SELECT revision_id,work_id,piece_id FROM revision_work_reservations ORDER BY revision_id,work_key",
        )
        .all(),
    ).toEqual([
      { revision_id: "p1-r1", work_id: "a3", piece_id: "a3-piece" },
      { revision_id: "p1-r2", work_id: "a3", piece_id: "a3-piece" },
      { revision_id: "p1-r4", work_id: "a3", piece_id: "a3-piece" },
      { revision_id: "p1-r4", work_id: "c-held", piece_id: "c-held-piece" },
    ]);
    expect(
      db
        .prepare(
          "SELECT count(*) AS n FROM revision_work_pieces WHERE work_id IN ('a1','a2','b-held')",
        )
        .get(),
    ).toEqual({ n: 0 });
    expect(db.prepare("SELECT work_id FROM attempts").all()).toEqual([{ work_id: "a-tried" }]);
    expect(db.prepare("SELECT work_id FROM review_checkpoints").all()).toEqual([
      { work_id: "g-checked" },
    ]);
    expect(db.prepare("SELECT count(*) AS n FROM project_assets").get()).toEqual({ n: 1 });
    expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  } finally {
    db.close();
  }
});

it("leaves a database without copies as it was", () => {
  const db = openDb(":memory:");
  try {
    migrate(db, clock, { through: 19 });
    db.exec("INSERT INTO projects VALUES ('p1','Saved','16:9','{}','old','old')");
    db.exec(
      "INSERT INTO stages (id,project_id,kind,source,state) VALUES ('p1-images','p1','images','generate','pending')",
    );
    db.exec("INSERT INTO project_revisions VALUES ('p1-r1','p1',NULL,NULL,'{}','{}','{}','old')");
    work(db, { id: "only", key: "image:a", fp: "fa" });
    work(db, { id: "done", key: "image:b", fp: "fb", state: "done" });

    migrate(db, clock);

    expect(ids(db)).toEqual(["done", "only"]);
  } finally {
    db.close();
  }
});
