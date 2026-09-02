import { describe, expect, it } from "vitest";
import { openDb } from "./index.js";
import { transact } from "./tx.js";

function counted(): ReturnType<typeof openDb> {
  const db = openDb(":memory:");
  db.exec("CREATE TABLE t (n INTEGER)");
  return db;
}

function rows(db: ReturnType<typeof openDb>): number {
  const row = db.prepare("SELECT count(*) AS n FROM t").get();
  return typeof row?.n === "number" ? row.n : -1;
}

describe("transact", () => {
  it("commits the writes and returns the block's value", () => {
    const db = counted();

    const value = transact(db, () => {
      db.exec("INSERT INTO t VALUES (1)");
      return "done";
    });

    expect(value).toBe("done");
    expect(rows(db)).toBe(1);
    db.close();
  });

  it("rolls the writes back and rethrows", () => {
    const db = counted();

    expect(() =>
      transact(db, () => {
        db.exec("INSERT INTO t VALUES (1)");
        throw new Error("no");
      }),
    ).toThrow("no");

    expect(rows(db)).toBe(0);
    db.close();
  });

  it("nests, so an inner block's writes ride on the outer one's outcome", () => {
    const db = counted();

    expect(() =>
      transact(db, () => {
        transact(db, () => {
          db.exec("INSERT INTO t VALUES (1)");
        });
        db.exec("INSERT INTO t VALUES (2)");
        throw new Error("no");
      }),
    ).toThrow("no");

    expect(rows(db)).toBe(0);
    db.close();
  });

  it("lets an outer block continue after an inner one rolled back", () => {
    const db = counted();

    transact(db, () => {
      expect(() =>
        transact(db, () => {
          db.exec("INSERT INTO t VALUES (1)");
          throw new Error("no");
        }),
      ).toThrow("no");
      db.exec("INSERT INTO t VALUES (2)");
    });

    expect(rows(db)).toBe(1);
    db.close();
  });
});
