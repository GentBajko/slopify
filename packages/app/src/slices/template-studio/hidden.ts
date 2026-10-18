import { transact } from "../../kernel/db/tx.js";
import { type DeleteDeps, type DeleteResult, deleteProject } from "../storage/delete-project.js";

// Removes one of the studio's hidden projects (a sample made again on its own project, a
// bake-off copy) for good. What it was charged today stays counted against the sample budget:
// its priced calls are kept in `template_studio_spend` first, so removing a project never
// frees budget it already spent.
export function removeHiddenProject(deps: DeleteDeps, projectId: string): DeleteResult {
  return transact(deps.db, () => {
    deps.db
      .prepare(
        `INSERT INTO template_studio_spend (project_id,cost,created_at)
         SELECT project_id,cost,created_at FROM provider_usage
         WHERE project_id=? AND on_plan=0 AND cost > 0`,
      )
      .run(projectId);
    const removed = deleteProject(deps, projectId);
    // A project that stays (running, a file the OS keeps) keeps its own rows: not counted twice.
    if (!removed.ok)
      deps.db.prepare("DELETE FROM template_studio_spend WHERE project_id=?").run(projectId);
    return removed;
  });
}
