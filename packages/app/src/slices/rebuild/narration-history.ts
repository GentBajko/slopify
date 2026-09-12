import { statSync } from "node:fs";
import { z } from "zod";
import type { ManifestPiece, RevisionDeps } from "../revisions/model.js";
import { stagePieceSchema } from "../revisions/schema.js";
import { outputPath } from "../storage/layout.js";

export function retainedNarrationPieces(
  deps: Pick<RevisionDeps, "db" | "paths">,
  projectId: string,
): readonly (ManifestPiece & { readonly available: boolean })[] {
  return deps.db
    .prepare(`SELECT p.piece_key,p.asset_id,p.fingerprint,p.descriptor,a.path FROM revision_pieces p
    JOIN project_assets a ON a.id=p.asset_id AND a.project_id=p.project_id
    WHERE p.project_id=? AND p.stage_kind='audio' ORDER BY p.created_at,p.id`)
    .all(projectId)
    .map((value) => {
      const row = z
        .object({
          piece_key: z.string(),
          asset_id: z.string(),
          fingerprint: z.string(),
          descriptor: z.string(),
          path: z.string(),
        })
        .parse(value);
      return {
        key: row.piece_key,
        stageKind: "audio" as const,
        assetId: row.asset_id,
        fingerprint: row.fingerprint,
        piece: stagePieceSchema.parse(JSON.parse(row.descriptor)),
        available:
          statSync(outputPath(deps.paths, projectId, row.path), {
            throwIfNoEntry: false,
          })?.isFile() === true,
      };
    });
}
export function referencedAssetsAvailable(
  deps: Pick<RevisionDeps, "db" | "paths">,
  projectId: string,
  ids: readonly string[],
): readonly string[] {
  return ids.filter((id) => {
    const row = deps.db
      .prepare("SELECT path FROM project_assets WHERE project_id=? AND id=?")
      .get(projectId, id);
    return (
      row !== undefined &&
      statSync(outputPath(deps.paths, projectId, z.string().parse(row.path)), {
        throwIfNoEntry: false,
      })?.isFile() === true
    );
  });
}
