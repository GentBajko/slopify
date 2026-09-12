import { rmSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { stagingPath } from "./layout.js";
import { deleteStagedFile, stagedFileById } from "./repo.js";
import type { StorageDeps } from "./staging.js";

export function stagedFileReferenced(db: DatabaseSync, id: string): boolean {
  return (
    db.prepare("SELECT 1 FROM play_draft_attachments WHERE staged_file_id=? LIMIT 1").get(id) !==
    undefined
  );
}

export function releaseStagedFile(deps: StorageDeps, id: string): void {
  // A nested savepoint cannot prove that its caller will commit. Boot collects deferred releases.
  if (deps.db.isTransaction || stagedFileReferenced(deps.db, id)) return;
  const file = stagedFileById(deps.db, id);
  // An active stream owns its open file until completion, including on Windows.
  if (file?.state === "copying") return;
  try {
    rmSync(stagingPath(deps.paths, file?.path ?? id), { force: true });
  } catch (error) {
    deps.log.write("warn", "staging.release", {
      detail: `${id}: ${error instanceof Error ? error.message : String(error)}`,
    });
    return;
  }
  deleteStagedFile(deps.db, id);
}
