import type { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { fixedClock } from "../clock.fake.js";
import { openDb } from "../db/index.js";
import { migrate } from "../db/migrate.js";
import type { StagePiece } from "./piece-repo.js";
import { insertPiece, piecesOf, setPiece } from "./piece-repo.js";

const clock = fixedClock("2026-09-02T10:00:00.000Z");

function migrated(): DatabaseSync {
  const db = openDb(":memory:");
  migrate(db, clock);
  db.exec("INSERT INTO projects VALUES ('p1','t','16:9','{}','2026-09-01','2026-09-01')");
  db.exec(
    "INSERT INTO stages (id, project_id, kind, source, state) VALUES ('s1','p1','research','generate','running')",
  );
  return db;
}

function chapter(id: string, idx: number, payload: string | null = null): StagePiece {
  return { id, stageId: "s1", kind: "chapter", idx, state: "pending", payload };
}

describe("stage pieces", () => {
  it("reads back what was written, in index order", () => {
    const db = migrated();
    insertPiece(db, chapter("c2", 2, '{"title":"Second"}'));
    insertPiece(db, chapter("c1", 1, '{"title":"First"}'));

    expect(piecesOf(db, "s1", "chapter")).toEqual([
      {
        id: "c1",
        stageId: "s1",
        kind: "chapter",
        idx: 1,
        state: "pending",
        payload: '{"title":"First"}',
      },
      {
        id: "c2",
        stageId: "s1",
        kind: "chapter",
        idx: 2,
        state: "pending",
        payload: '{"title":"Second"}',
      },
    ]);
    db.close();
  });

  it("answers nothing for a stage with no pieces of that kind", () => {
    const db = migrated();
    insertPiece(db, chapter("c1", 1));

    expect(piecesOf(db, "s1", "image")).toEqual([]);
    expect(piecesOf(db, "s2", "chapter")).toEqual([]);
    db.close();
  });

  it("moves a piece to its next state with its payload", () => {
    const db = migrated();
    insertPiece(db, chapter("c1", 1, '{"title":"First"}'));

    setPiece(db, "c1", "done", '{"title":"First","notes":"what was found"}');

    expect(piecesOf(db, "s1", "chapter")[0]).toEqual({
      id: "c1",
      stageId: "s1",
      kind: "chapter",
      idx: 1,
      state: "done",
      payload: '{"title":"First","notes":"what was found"}',
    });
    db.close();
  });

  // The UNIQUE(stage_id, kind, idx) of 02-models: a second run that planned the same
  // chapters must not be able to double them.
  it("refuses a second piece at the same index", () => {
    const db = migrated();
    insertPiece(db, chapter("c1", 1));

    expect(() => {
      insertPiece(db, chapter("c2", 1));
    }).toThrow();
    db.close();
  });
});
