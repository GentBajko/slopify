import { statSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import type { ManifestPiece, RevisionDeps } from "../revisions/model.js";
import { assetPathOrUndefined } from "../revisions/mutation-assets.js";
import { stagePieceSchema } from "../revisions/schema.js";
import { outputPath, outputPaths } from "../storage/layout.js";

// Every narration chunk any version of the project made, with whether its file is still on
// disk. The plan is derived again after every finished step of a run, and each derivation
// read and parsed every retained chunk's saved record again: thousands on a project voiced a few
// times over, megabytes of text each time. A saved record is written once and never changed
// (only `selected` is), so each one is read and parsed once and kept by its row id; the rows
// themselves, and whether each file is on disk, are looked up afresh every time.
// Per database, never shared between them (two can hold the same ids); a few projects at once.
type HistoryRecord = ManifestPiece;
const keptRecords = new WeakMap<DatabaseSync, Map<string, Map<string, HistoryRecord>>>();
const keptProjects = 12;
const historyRow = z.object({
  id: z.string(),
  piece_key: z.string(),
  asset_id: z.string(),
  fingerprint: z.string(),
  path: z.string(),
});
const descriptorRow = z.object({ id: z.string(), descriptor: z.string() });

// Forgets every narration record kept for this database (tests compare against fresh reads).
export function forgetNarrationHistory(db: DatabaseSync): void {
  keptRecords.delete(db);
}

export function retainedNarrationPieces(
  deps: Pick<RevisionDeps, "db" | "paths">,
  projectId: string,
): readonly (ManifestPiece & { readonly available: boolean })[] {
  return retainedNarrationHistory(deps, projectId).pieces;
}

// The same, and a mark of it for the plan's key: which saved rows it holds, and whether each
// one's file is on disk. Two histories with one mark hold the same pieces, since a saved
// record never changes.
export function retainedNarrationHistory(
  deps: Pick<RevisionDeps, "db" | "paths">,
  projectId: string,
): {
  readonly pieces: readonly (ManifestPiece & { readonly available: boolean })[];
  readonly mark: string;
} {
  const rows = deps.db
    .prepare(`SELECT p.id,p.piece_key,p.asset_id,p.fingerprint,a.path FROM revision_pieces p
    JOIN project_assets a ON a.id=p.asset_id AND a.project_id=p.project_id
    WHERE p.project_id=? AND p.stage_kind='audio' ORDER BY p.created_at,p.id`)
    .all(projectId)
    .map((value) => historyRow.parse(value));
  const forDb = keptRecords.get(deps.db) ?? new Map<string, Map<string, HistoryRecord>>();
  keptRecords.set(deps.db, forDb);
  const before = forDb.get(projectId);
  // The columns read with the rows must still match the kept record, or it is read again.
  const keeps = (row: z.infer<typeof historyRow>, kept: HistoryRecord | undefined) =>
    kept !== undefined &&
    kept.key === row.piece_key &&
    kept.assetId === row.asset_id &&
    kept.fingerprint === row.fingerprint;
  const missing = rows.filter((row) => !keeps(row, before?.get(row.id)));
  const descriptors = new Map<string, string>();
  const one = deps.db.prepare("SELECT id,descriptor FROM revision_pieces WHERE id=?");
  for (const row of missing) {
    const found = one.get(row.id);
    if (found !== undefined) {
      const parsed = descriptorRow.parse(found);
      descriptors.set(parsed.id, parsed.descriptor);
    }
  }
  const records = new Map<string, HistoryRecord>();
  const marks: string[] = [];
  const pathOf = outputPaths(deps.paths, projectId);
  const result = rows.flatMap((row) => {
    const kept = before?.get(row.id);
    let record: HistoryRecord;
    if (kept !== undefined && keeps(row, kept)) record = kept;
    else {
      const descriptor = descriptors.get(row.id);
      // Deleted between the two reads: it is no longer part of the history.
      if (descriptor === undefined) return [];
      record = {
        key: row.piece_key,
        stageKind: "audio" as const,
        assetId: row.asset_id,
        fingerprint: row.fingerprint,
        piece: stagePieceSchema.parse(JSON.parse(descriptor)),
      };
    }
    records.set(row.id, record);
    const available = statSync(pathOf(row.path), { throwIfNoEntry: false })?.isFile() === true;
    marks.push(
      `${row.id}:${row.piece_key}:${row.asset_id}:${row.fingerprint}:${available ? 1 : 0}`,
    );
    return [{ ...record, available }];
  });
  forDb.delete(projectId);
  forDb.set(projectId, records);
  if (forDb.size > keptProjects) forDb.delete(forDb.keys().next().value as string);
  return { pieces: result, mark: marks.join("\n") };
}
export function referencedAssetsAvailable(
  deps: Pick<RevisionDeps, "db" | "paths">,
  projectId: string,
  ids: readonly string[],
): readonly string[] {
  return ids.filter((id) => {
    const path = assetPathOrUndefined(deps, projectId, id);
    return (
      path !== undefined &&
      statSync(outputPath(deps.paths, projectId, path), {
        throwIfNoEntry: false,
      })?.isFile() === true
    );
  });
}
