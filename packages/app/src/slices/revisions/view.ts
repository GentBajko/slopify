import { readFileSync, statSync } from "node:fs";
import { z } from "zod";
import { outputPath } from "../storage/layout.js";
import type { OutputRole } from "../storage/model.js";
import { narrationJoinPiecesOfProject, narrationJoinsOfProject } from "./manifest-repo.js";
import type {
  ProjectRevision,
  RevisionDeps,
  RevisionOutputView,
  RevisionPieceView,
  RevisionView,
} from "./model.js";
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

// An output a step can read: selected, its file on disk and finished, narrowed to one role or
// one step's outputs when given.
export interface OutputMatch {
  readonly role?: OutputRole | undefined;
  readonly workKey?: string | undefined;
}

export function isReadyOutput(row: RevisionOutputView, match: OutputMatch = {}): boolean {
  return (
    row.selected &&
    row.available &&
    row.state === "ready" &&
    (match.role === undefined || row.output.role === match.role) &&
    (match.workKey === undefined || row.workKey === match.workKey)
  );
}

export function readyOutput(
  view: Pick<RevisionView, "outputs">,
  match: OutputMatch = {},
): RevisionOutputView | undefined {
  return view.outputs.find((row) => isReadyOutput(row, match));
}

// A piece a step can read: selected, its file (if any) on disk and done, under `key` when given.
export function isDonePiece(row: RevisionPieceView, key?: string): boolean {
  return (
    row.selected &&
    row.available &&
    row.piece.state === "done" &&
    (key === undefined || row.key === key)
  );
}

export function donePiece(
  view: Pick<RevisionView, "pieces">,
  key: string,
): RevisionPieceView | undefined {
  return view.pieces.find((row) => isDonePiece(row, key));
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
