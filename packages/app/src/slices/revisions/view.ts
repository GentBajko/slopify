import { readFileSync, statSync } from "node:fs";
import { z } from "zod";
import { outputPath } from "../storage/layout.js";
import { narrationJoinPiecesOfProject, narrationJoinsOfProject } from "./manifest-repo.js";
import type { ProjectRevision, RevisionDeps, RevisionOutputView, RevisionView } from "./model.js";
import { currentRevisionId, outputsForRevision, piecesForRevision, revisionById } from "./repo.js";

export function getRevisionView(
  deps: RevisionDeps,
  projectId: string,
  revisionId: string,
): RevisionView | undefined {
  const revision = revisionById(deps.db, projectId, revisionId);
  if (revision === undefined) return undefined;
  const available = (assetId: string): boolean => {
    const row = deps.db
      .prepare("SELECT path FROM project_assets WHERE project_id=? AND id=?")
      .get(projectId, assetId);
    if (row === undefined) throw new Error(`Revision asset ${assetId} is not registered.`);
    const path = z.object({ path: z.string() }).parse(row).path;
    return (
      statSync(outputPath(deps.paths, projectId, path), { throwIfNoEntry: false })?.isFile() ===
      true
    );
  };
  const outputs = outputsForRevision(deps.db, projectId, revisionId).map((row) => ({
    ...row,
    available: available(row.assetId),
  }));
  const pieces = piecesForRevision(deps.db, projectId, revisionId).map((row) => ({
    ...row,
    available: row.assetId === null || available(row.assetId),
  }));
  return {
    revision,
    outputs,
    pieces,
    current: currentRevisionId(deps.db, projectId) === revisionId,
    articleMarkdown: resolvedArticleMarkdown(deps, revision, outputs),
  };
}

export function resolvedArticleMarkdown(
  deps: Pick<RevisionDeps, "paths">,
  revision: ProjectRevision,
  outputs: readonly RevisionOutputView[],
): string | null {
  if (revision.content.articleEdited === true && revision.content.articleMarkdown !== undefined)
    return revision.content.articleMarkdown;
  const article = outputs.find(
    (one) => one.selected && one.available && one.output.role === "article_md",
  );
  if (article !== undefined)
    return readFileSync(outputPath(deps.paths, revision.projectId, article.output.path), "utf8");
  return revision.config.sources.article === "provide"
    ? (revision.config.provided.article ?? null)
    : revision.config.sources.article === "off"
      ? ""
      : null;
}

// The view with the narration joins of every version of the project, for planning: turning
// softening on looks up the joins a finished word timing was made from
// (`rebuild/recipe-softening.ts`), which a later version no longer holds.
export function withEarlierJoins<T extends RevisionView>(
  deps: Pick<RevisionDeps, "db">,
  view: T,
): T {
  return {
    ...view,
    earlierJoins: narrationJoinsOfProject(deps.db, view.revision.projectId),
    earlierJoinPieces: narrationJoinPiecesOfProject(deps.db, view.revision.projectId),
  };
}
