import { chmodSync, existsSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

// SQLITE_CONSTRAINT_UNIQUE. The extended result code node:sqlite puts on the error it
// throws when a UNIQUE index rejects a row.
const uniqueConstraint = 2067;

export function openDb(file: string): DatabaseSync {
  const db = new DatabaseSync(file, { enableForeignKeyConstraints: true, timeout: 5000 });
  db.exec("PRAGMA journal_mode = WAL");
  // Provider keys live in this file. The data directory is already 0700, but SQLite
  // creates the database and its WAL sidecars at 0644, which would survive a copy out.
  if (file !== ":memory:") {
    for (const path of [file, `${file}-wal`, `${file}-shm`]) {
      if (existsSync(path)) {
        chmodSync(path, 0o600);
      }
    }
  }
  return db;
}

// Which uniqueness rule was broken is the caller's to know from the statement it ran;
// this only says that the schema, not the code, refused the row.
export function isUniqueConstraint(error: unknown): boolean {
  return error instanceof Error && "errcode" in error && error.errcode === uniqueConstraint;
}
