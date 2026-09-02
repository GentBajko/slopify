import { DatabaseSync } from "node:sqlite";

export function openDb(file: string): DatabaseSync {
  const db = new DatabaseSync(file, { enableForeignKeyConstraints: true, timeout: 5000 });
  db.exec("PRAGMA journal_mode = WAL");
  return db;
}
