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
  it("refuses an asynchronous block rather than releasing before its writes land", () => {
    const db = counted();

    expect(() =>
      transact(db, async () => {
        // Runs synchronously up to the first await, so this insert really happens.
        db.exec("INSERT INTO t VALUES (1)");
        await Promise.resolve();
        db.exec("INSERT INTO t VALUES (2)");
      }),
    ).toThrow(/synchronous/);

    expect(rows(db)).toBe(0);
    db.close();
  });

  it("leaves no frame open when the block's own rollback cannot run", () => {
    const db = counted();

    // The inner block closes the savepoint out from under itself, so the unwind fails.
    expect(() =>
      transact(db, () => {
        db.exec("INSERT INTO t VALUES (1)");
        db.exec("RELEASE slopify");
        throw new Error("the disk is full");
      }),
    ).toThrow(/could not be unwound/);

    // The outer frame is gone with it: a later transaction commits and rolls back on its
    // own, rather than riding on a frame that was left open.
    expect(() =>
      transact(db, () => {
        db.exec("INSERT INTO t VALUES (2)");
        throw new Error("no");
      }),
    ).toThrow("no");
    transact(db, () => {
      db.exec("INSERT INTO t VALUES (3)");
    });
    expect(rows(db)).toBe(2);
    db.close();
  });

  it("keeps the original failure as the cause when the unwind also fails", () => {
    const db = counted();

    try {
      transact(db, () => {
        db.exec("RELEASE slopify");
        throw new Error("the disk is full");
      });
      throw new Error("transact should have thrown");
    } catch (error) {
      expect((error as Error).message).toMatch(/could not be unwound/);
      expect(((error as Error).cause as Error).message).toBe("the disk is full");
    }
    db.close();
  });

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
