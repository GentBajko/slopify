import { statSync } from "node:fs";
import type { StagePiece } from "../../kernel/runner/piece-repo.js";
import { outputPath } from "../storage/layout.js";
import type { Output } from "../storage/model.js";
import { pieceFile } from "../storage/reconcile.js";
import type { ProjectAsset, RevisionDeps } from "./model.js";
import { insertAsset } from "./repo.js";

export function adoptAssets(
  deps: RevisionDeps,
  projectId: string,
  outputs: readonly Output[],
  pieces: readonly StagePiece[],
): ReadonlyMap<string, ProjectAsset> {
  const assets = new Map<string, ProjectAsset>();
  const capture = (path: string, bytes: number | null): void => {
    if (assets.has(path)) return;
    outputPath(deps.paths, projectId, path);
    const asset: ProjectAsset = {
      id: deps.ids.next(),
      projectId,
      path,
      bytes,
      createdAt: deps.clock.now().toISOString(),
    };
    insertAsset(deps.db, asset);
    assets.set(path, asset);
  };
  for (const output of outputs) capture(output.path, output.bytes);
  for (const piece of pieces) {
    const path = pieceFile(piece.payload);
    if (path === undefined) continue;
    const stats = statSync(outputPath(deps.paths, projectId, path), { throwIfNoEntry: false });
    capture(path, stats?.isFile() === true ? stats.size : null);
  }
  return assets;
}
