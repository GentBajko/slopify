import { rmSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import type { Log } from "../../kernel/log.js";
import type { Paths } from "../../kernel/paths.js";
import { derive } from "../../kernel/runner/graph.js";
import { projectExists, stagesOf } from "../admission/repo.js";
import { projectDir } from "./layout.js";

// `logic/14` step 4: Delete on a project is refused while it is `running`; otherwise it
// removes the database rows and the folder. It is irreversible and it is only available
// from the app (§Q117, §Q118). The confirmation in front of it is 07 Projects'.

export interface DeleteDeps {
  readonly db: DatabaseSync;
  readonly paths: Paths;
  readonly log: Log;
}

export type DeleteRefusal =
  | "no-project"
  // §Q117: a run in flight has files being written under it; stopping it is the user's
  // own decision to make first.
  | "running"
  // The unhappy path of `logic/14`: a file the OS will not let go of. The project stays
  // listed with the error and Delete can be pressed again.
  | "files";

export type DeleteResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: DeleteRefusal; readonly detail?: string };

export function deleteProject(deps: DeleteDeps, projectId: string): DeleteResult {
  if (!projectExists(deps.db, projectId)) {
    return { ok: false, reason: "no-project" };
  }
  if (derive(stagesOf(deps.db, projectId)) === "running") {
    return { ok: false, reason: "running" };
  }

  // Files first, rows second. A folder that would not go leaves the project listed, which
  // is what `logic/14`'s unhappy path asks for; rows removed first would leave the files
  // orphaned under a project nothing names.
  const dir = projectDir(deps.paths, projectId);
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch (error) {
    deps.log.write("warn", "project.delete", {
      projectId,
      detail: messageOf(error),
    });
    return { ok: false, reason: "files", detail: messageOf(error) };
  }

  // Stages, attempts, pieces and outputs go with it: every one of those tables declares
  // ON DELETE CASCADE on the project, and the connection runs with foreign keys on
  // (kernel/db/index.ts). The invariant of `logic/14` is that a deleted project leaves no
  // files and no rows.
  deps.db.prepare("DELETE FROM projects WHERE id = ?").run(projectId);
  return { ok: true };
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
