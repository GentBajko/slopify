import type { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { fixedClock } from "../clock.fake.js";
import { openDb } from "../db/index.js";
import { migrate } from "../db/migrate.js";
import type { Ids } from "../ids.js";
import { attemptsOf, sqliteAttempts } from "./attempt-repo.js";

function migrated(): DatabaseSync {
  const db = openDb(":memory:");
  migrate(db, fixedClock("2026-09-02T10:00:00.000Z"));
  db.exec("INSERT INTO projects VALUES ('p1','Hello','16:9','{}','2026-09-01','2026-09-01')");
  db.exec(
    "INSERT INTO stages (id, project_id, kind, source, state) VALUES ('s1','p1','images','generate','running')",
  );
  return db;
}

function counting(): Ids {
  let n = 0;
  return {
    next: (): string => {
      n += 1;
      return `a${n}`;
    },
  };
}

describe("sqliteAttempts", () => {
  it("opens a row when the attempt starts and closes it with the outcome", () => {
    const db = migrated();
    const store = sqliteAttempts(db, counting());

    const id = store.start({
      stageId: "s1",
      pieceId: null,
      n: 1,
      startedAt: "2026-09-02T10:00:00.000Z",
    });
    expect(attemptsOf(db, "s1")).toEqual([
      {
        id: "a1",
        stageId: "s1",
        pieceId: null,
        n: 1,
        startedAt: "2026-09-02T10:00:00.000Z",
        endedAt: null,
        outcome: null,
        errorText: null,
      },
    ]);

    store.end(id, {
      outcome: "rate_limit",
      endedAt: "2026-09-02T10:00:02.000Z",
      errorText: "429 slow down",
    });
    expect(attemptsOf(db, "s1")[0]).toMatchObject({
      endedAt: "2026-09-02T10:00:02.000Z",
      outcome: "rate_limit",
      errorText: "429 slow down",
    });
  });

  it("keeps the stage's attempt count in step with the last attempt opened", () => {
    const db = migrated();
    const store = sqliteAttempts(db, counting());
    const count = (): unknown =>
      db.prepare("SELECT attempt_count FROM stages WHERE id = 's1'").get()?.attempt_count;

    expect(count()).toBe(0);
    store.start({ stageId: "s1", pieceId: null, n: 1, startedAt: "2026-09-02T10:00:00.000Z" });
    expect(count()).toBe(1);
    store.start({ stageId: "s1", pieceId: null, n: 2, startedAt: "2026-09-02T10:00:02.000Z" });
    expect(count()).toBe(2);
  });

  it("names the piece an attempt belongs to and keeps them in order", () => {
    const db = migrated();
    const store = sqliteAttempts(db, counting());

    store.start({ stageId: "s1", pieceId: "image-3", n: 1, startedAt: "2026-09-02T10:00:00.000Z" });
    store.start({ stageId: "s1", pieceId: "image-7", n: 1, startedAt: "2026-09-02T10:00:01.000Z" });

    expect(attemptsOf(db, "s1").map((row) => row.pieceId)).toEqual(["image-3", "image-7"]);
  });

  it("goes with the project when it is deleted", () => {
    const db = migrated();
    const store = sqliteAttempts(db, counting());
    store.start({ stageId: "s1", pieceId: null, n: 1, startedAt: "2026-09-02T10:00:00.000Z" });

    db.exec("DELETE FROM projects WHERE id = 'p1'");

    expect(attemptsOf(db, "s1")).toEqual([]);
  });
});
