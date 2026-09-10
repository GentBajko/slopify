import { transact } from "../../kernel/db/tx.js";
import { allPiecesOf } from "../../kernel/runner/piece-repo.js";
import { projectById, stagesOf } from "../admission/repo.js";
import { withProjectControl } from "../control/lock.js";
import { legacyImageOutput } from "../rebuild/recipe-legacy.js";
import {
  baselineFingerprints,
  legacyOutputSlot,
  legacyOutputWorkKey,
  legacyPieceKey,
} from "../rebuild/recipes.js";
import { pieceFile } from "../storage/reconcile.js";
import { outputsOf } from "../storage/repo.js";
import { adoptAssets } from "./adopt-assets.js";
import { baselineContent } from "./adopt-content.js";
import type { BaselineResult, ProjectRevision, RevisionDeps } from "./model.js";
import {
  currentRevisionId,
  insertManifestOutput,
  insertManifestPiece,
  insertRevision,
  selectOutputRecord,
  selectPieceRecord,
} from "./repo.js";
import { getRevisionView } from "./view.js";

export function ensureBaseline(deps: RevisionDeps, projectId: string): Promise<BaselineResult> {
  return withProjectControl(deps.db, projectId, () =>
    transact(deps.db, (): BaselineResult => {
      const project = projectById(deps.db, projectId);
      if (project === undefined) return { ok: false, reason: "no-project" };
      const head = currentRevisionId(deps.db, projectId);
      if (head !== undefined) {
        const view = getRevisionView(deps, projectId, head);
        if (view === undefined) throw new Error("The project head has no revision.");
        return { ok: true, created: false, view };
      }
      const outputs = outputsOf(deps.db, projectId);
      const stages = stagesOf(deps.db, projectId);
      const pieces = stages.flatMap((stage) => allPiecesOf(deps.db, stage.id));
      const assets = adoptAssets(deps, projectId, outputs, pieces);
      const content = baselineContent(deps, project, outputs, pieces, assets);
      const fingerprints = baselineFingerprints(project, outputs, pieces, content, stages);
      const revision: ProjectRevision = {
        id: deps.ids.next(),
        projectId,
        parentId: null,
        restoredFromId: null,
        config: project.config,
        content,
        fingerprints,
        createdAt: deps.clock.now().toISOString(),
      };
      insertRevision(deps.db, revision);
      const selectedSlots = new Set<string>();
      const selectedPieces = new Set<string>();
      const recordedFingerprint = (key: string): string => {
        const value = fingerprints[key];
        if (value === undefined)
          throw new Error(`No baseline fingerprint for retained work ${key}`);
        return value;
      };
      for (const output of outputs) {
        const asset = assets.get(output.path);
        if (asset === undefined) throw new Error("The retained output has no registered asset.");
        const slot = legacyOutputSlot(output);
        const workKey = legacyOutputWorkKey(output, project.config);
        const recordId = deps.ids.next();
        insertManifestOutput(
          deps.db,
          revision,
          {
            slot,
            workKey,
            assetId: asset.id,
            output,
            fingerprint: recordedFingerprint(workKey),
            state: "ready",
          },
          recordId,
        );
        if (!selectedSlots.has(slot)) {
          selectOutputRecord(deps.db, revision.id, slot, recordId);
          selectedSlots.add(slot);
        }
      }
      for (const stage of stages) {
        for (const piece of pieces.filter((row) => row.stageId === stage.id)) {
          const image = piece.kind === "image" ? legacyImageOutput(piece, outputs) : undefined;
          const path = pieceFile(piece.payload) ?? image?.path;
          const key = legacyPieceKey(piece, stage.kind, outputs);
          const recordId = deps.ids.next();
          insertManifestPiece(
            deps.db,
            revision,
            {
              key,
              stageKind: stage.kind,
              piece,
              assetId: path === undefined ? null : (assets.get(path)?.id ?? null),
              fingerprint: recordedFingerprint(key),
            },
            recordId,
          );
          if (!selectedPieces.has(key)) {
            selectPieceRecord(deps.db, revision.id, key, recordId);
            selectedPieces.add(key);
          }
        }
      }
      deps.db
        .prepare("INSERT INTO project_heads(project_id,revision_id) VALUES (?,?)")
        .run(projectId, revision.id);
      const view = getRevisionView(deps, projectId, revision.id);
      if (view === undefined) throw new Error("The adopted revision was not retained.");
      return { ok: true, created: true, view };
    }),
  );
}
