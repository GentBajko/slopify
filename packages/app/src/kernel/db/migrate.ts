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
    throw new Error(
      `Your Slopify database was last used by a newer version of Slopify (database schema ${newest} is newer than this app knows (${newestKnown})). ` +
        "Update Slopify and start it again: npx @gentbajko/slopify@latest (or pull the latest Docker image). Your data was not changed.",
    );
  }

  for (const [index, file] of files.entries()) {
    const version = known[index];
    if (version === undefined || applied.has(version)) {
      continue;
    }
    const sql = readFileSync(new URL(file, migrationsDir), "utf8");
    // A migration that rebuilds a table other tables reference must run with enforcement
    // off: dropping the old table would otherwise cascade into every row that points at it.
    // SQLite ignores this pragma inside a transaction, so it is set around one, and every
    // reference is checked before the rebuild commits.
    const rebuild = sql.split("\n", 1)[0]?.trim() === foreignKeysOff;
    const enforced = rebuild && foreignKeysOn(db);
    if (enforced) db.exec("PRAGMA foreign_keys = OFF");
    db.exec("BEGIN");
    try {
      db.exec(sql);
      if (rebuild) {
        const broken = db.prepare("PRAGMA foreign_key_check").all();
        if (broken.length > 0) {
          throw new Error(
            `Slopify couldn't upgrade its database: migration ${file} would leave ${broken.length} broken links between saved records, so it was undone and your data was not changed. Go back to the previous version of Slopify (npx @gentbajko/slopify@<previous version>) and report this on GitHub with the Download diagnostics file from Settings.`,
          );
        }
      }
      db.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)").run(
        version,
        clock.now().toISOString(),
      );
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    } finally {
      if (enforced) db.exec("PRAGMA foreign_keys = ON");
    }
  }
}

// The first line of such a migration, compared without its line ending.
const foreignKeysOff = "-- foreign-keys: off";

function foreignKeysOn(db: DatabaseSync): boolean {
  return db.prepare("PRAGMA foreign_keys").get()?.foreign_keys === 1;
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
