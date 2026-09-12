import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { stageKinds } from "../../kernel/pipeline.js";
import { insertPiece } from "../../kernel/runner/piece-repo.js";
import { recipeInputSchema } from "../rebuild/recipe-input-schema.js";
import { insertOutput } from "../storage/repo.js";
import type {
  ManifestOutput,
  ManifestPiece,
  ProjectRevision,
  RevisionDeps,
  RevisionManifest,
} from "./model.js";
import {
  insertManifestOutput,
  insertManifestPiece,
  outputsForRevision,
  piecesForRevision,
  selectOutputRecord,
  selectPieceRecord,
} from "./repo.js";

export function ensureRevisionStages(deps: RevisionDeps, revision: ProjectRevision): void {
  for (const kind of stageKinds) {
    const source = revision.config.sources[kind];
    deps.db
      .prepare(
        "INSERT INTO stages(id,project_id,kind,source,state) VALUES (?,?,?,?,?) ON CONFLICT(project_id,kind) DO UPDATE SET source=excluded.source",
      )
      .run(
        deps.ids.next(),
        revision.projectId,
        kind,
        source,
        source === "off" ? "skipped" : "pending",
      );
  }
}
export function positionedOutput(revision: ProjectRevision, row: ManifestOutput): ManifestOutput {
  if (row.output.role !== "image") return row;
  const index = revision.content.imageOrder.indexOf(row.workKey.replace(/^image:/, ""));
  return index < 0
    ? row
    : { ...row, output: { ...row.output, meta: { ...row.output.meta, index: index + 1 } } };
}
export function positionedPiece(revision: ProjectRevision, row: ManifestPiece): ManifestPiece {
  if (row.piece.kind !== "image") return row;
  const index = revision.content.imageOrder.indexOf(row.key.replace(/^image:/, ""));
  return index < 0 ? row : { ...row, piece: { ...row.piece, idx: index + 1 } };
}
export function cloneManifest(
  deps: RevisionDeps,
  revision: ProjectRevision,
  manifest: RevisionManifest,
): void {
  for (const row of manifest.outputs) {
    if (
      row.output.role === "image" &&
      !revision.content.imageOrder.includes(row.workKey.replace(/^image:/, ""))
    )
      continue;
    const recordId = deps.ids.next();
    insertManifestOutput(deps.db, revision, positionedOutput(revision, row), recordId);
    selectOutputRecord(deps.db, revision.id, row.slot, recordId);
  }
  for (const row of manifest.pieces) {
    if (
      row.piece.kind === "image" &&
      !revision.content.imageOrder.includes(row.key.replace(/^image:/, ""))
    )
      continue;
    const recordId = deps.ids.next();
    insertManifestPiece(deps.db, revision, positionedPiece(revision, row), recordId);
    selectPieceRecord(deps.db, revision.id, row.key, recordId);
  }
}
export function projectSelected(db: DatabaseSync, revision: ProjectRevision): void {
  const outputs = outputsForRevision(db, revision.projectId, revision.id).filter(
    (row) => row.selected,
  );
  const pieces = piecesForRevision(db, revision.projectId, revision.id).filter(
    (row) =>
      row.selected &&
      (revision.fingerprints[row.key] !== undefined ||
        desiredPhysicalPiece(db, revision, row) ||
        db
          .prepare("SELECT 1 FROM revision_work_reservations WHERE revision_id=? AND work_key=?")
          .get(revision.id, row.key) !== undefined),
  );
  db.prepare("DELETE FROM outputs WHERE project_id=?").run(revision.projectId);
  for (const row of outputs) insertOutput(db, row.output);
  db.prepare(
    "DELETE FROM stage_pieces WHERE stage_id IN (SELECT id FROM stages WHERE project_id=?)",
  ).run(revision.projectId);
  for (const row of pieces) {
    const stage = db
      .prepare("SELECT id FROM stages WHERE project_id=? AND kind=?")
      .get(revision.projectId, row.stageKind);
    if (stage === undefined || z.string().parse(stage.id) !== row.piece.stageId)
      throw new Error("Manifest piece stage does not belong to this project.");
    insertPiece(db, row.piece);
  }
}

function desiredPhysicalPiece(
  db: DatabaseSync,
  revision: ProjectRevision,
  row: ManifestPiece,
): boolean {
  const piece = db
    .prepare(
      "SELECT p.input_json FROM revision_work_pieces p JOIN revision_work w ON w.id=p.work_id WHERE p.id=? AND w.project_id=?",
    )
    .get(row.piece.id, revision.projectId);
  if (piece === undefined) return false;
  const input = recipeInputSchema.parse(JSON.parse(z.string().parse(piece.input_json)));
  return input.kind === "tts" && revision.fingerprints[`${input.logicalKey}:1`] !== undefined;
}
