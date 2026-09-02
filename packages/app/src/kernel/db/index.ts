import { chmodSync, existsSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

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
