import { readdirSync, readFileSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import type { Clock } from "../clock.js";

// Resolved from this module rather than from the working directory, so it holds both
// under Vitest (src/kernel/db/migrations) and after the build (dist/kernel/db/migrations,
// filled by packages/app/scripts/copy-migrations.mjs).
const migrationsDir = new URL("./migrations/", import.meta.url);

export function migrate(db: DatabaseSync, clock: Clock): void {
  const files = readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort();
  const known = files.map(versionOf);
  const applied = appliedVersions(db);
  const newest = Math.max(0, ...applied);
  const newestKnown = Math.max(0, ...known);
  if (newest > newestKnown) {
    throw new Error(`database schema ${newest} is newer than this app knows (${newestKnown})`);
  }

  for (const [index, file] of files.entries()) {
    const version = known[index];
    if (version === undefined || applied.has(version)) {
      continue;
    }
    db.exec("BEGIN");
    try {
      db.exec(readFileSync(new URL(file, migrationsDir), "utf8"));
      db.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)").run(
        version,
        clock.now().toISOString(),
      );
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
}

function versionOf(file: string): number {
  const version = Number(file.slice(0, 4));
  if (!Number.isInteger(version) || version < 1) {
    throw new Error(`migration ${file} does not start with a version number`);
  }
  return version;
}

// The first migration creates schema_migrations itself, so an absent table means
// nothing has been applied yet.
function appliedVersions(db: DatabaseSync): Set<number> {
  const table = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'")
    .get();
  if (table === undefined) {
    return new Set();
  }
  const versions = new Set<number>();
  for (const row of db.prepare("SELECT version FROM schema_migrations").all()) {
    const version = row.version;
    if (typeof version !== "number") {
      throw new Error(`schema_migrations holds a non-numeric version: ${String(version)}`);
    }
    versions.add(version);
  }
  return versions;
}
