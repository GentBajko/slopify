import type { DatabaseSync } from "node:sqlite";

// SQLite starts a transaction for a SAVEPOINT issued outside one and nests it inside one
// that is already open, so a slice can wrap its own writes without knowing whether its
// caller wrapped them too. The name is a constant rather than a parameter: SQLite matches
// RELEASE and ROLLBACK TO against the most recent savepoint of that name, which is
// exactly the nesting we want, and nothing a caller passes reaches the statement.
const savepoint = "slopify";

export function transact<T>(db: DatabaseSync, run: () => T): T {
  db.exec(`SAVEPOINT ${savepoint}`);
  try {
    const result = run();
    // node:sqlite is synchronous, so an async block would release this frame while its
    // awaited writes were still to come - and they would then land outside any
    // transaction. The frame is unwound below, which is the only safe answer.
    if (isThenable(result)) {
      throw new Error(
        "transact runs synchronous work only: an awaited write would land after the savepoint is released",
      );
    }
    // Inside the try: a RELEASE that fails leaves the frame open with the block's writes
    // uncommitted, which is a rollback, not a success to return a value from.
    db.exec(`RELEASE ${savepoint}`);
    return result;
  } catch (error) {
    unwind(db, error);
    throw error;
  }
}

// An unguarded ROLLBACK TO would leave the frame open on failure, and the enclosing
// transact - which names the same savepoint - would then aim its own rollback at the
// leaked frame and commit part of what it meant to undo.
function unwind(db: DatabaseSync, error: unknown): void {
  try {
    db.exec(`ROLLBACK TO ${savepoint}`);
    db.exec(`RELEASE ${savepoint}`);
  } catch (cleanup) {
    throw new Error(`the transaction could not be unwound: ${messageOf(cleanup)}`, {
      cause: error,
    });
  }
}

function isThenable(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    "then" in value &&
    typeof value.then === "function"
  );
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
