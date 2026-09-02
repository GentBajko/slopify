import type { DatabaseSync } from "node:sqlite";

// SQLite starts a transaction for a SAVEPOINT issued outside one and nests it inside one
// that is already open, so a slice can wrap its own writes without knowing whether its
// caller wrapped them too. The name is a constant rather than a parameter: SQLite matches
// RELEASE and ROLLBACK TO against the most recent savepoint of that name, which is
// exactly the nesting we want, and nothing a caller passes reaches the statement.
const savepoint = "slopify";

export function transact<T>(db: DatabaseSync, run: () => T): T {
  db.exec(`SAVEPOINT ${savepoint}`);
  let result: T;
  try {
    result = run();
  } catch (error) {
    db.exec(`ROLLBACK TO ${savepoint}`);
    db.exec(`RELEASE ${savepoint}`);
    throw error;
  }
  db.exec(`RELEASE ${savepoint}`);
  return result;
}
