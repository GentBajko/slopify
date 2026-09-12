import { transact } from "../../kernel/db/tx.js";
import type { PublicationRef } from "../../kernel/runner/work.js";
import { publicationTargets } from "../rebuild/repo.js";
import { discardPreparedAssets } from "../storage/assets.js";
import type { ManifestOutput, ManifestPiece, RevisionDeps } from "./model.js";
import { positionedOutput, positionedPiece, projectSelected } from "./projection.js";
import type { PreparedOutput, PreparedPiece, PublicationResult } from "./publication-model.js";
import {
  isPublicationReplay,
  publicationAuthority,
  replacementSlots,
  validateBundle,
  validatePublication,
} from "./publication-rules.js";
import {
  insertAsset,
  insertManifestOutput,
  insertManifestPiece,
  outputsForRevision,
  revisionById,
  selectOutputRecord,
  selectPieceRecord,
} from "./repo.js";

export type { PreparedOutput, PreparedPiece, PublicationResult } from "./publication-model.js";

export function commitRevisionOutputs(
  deps: RevisionDeps,
  publication: PublicationRef,
  outputs: readonly PreparedOutput[],
  pieces: readonly PreparedPiece[],
): PublicationResult {
  const assets = [
    ...outputs.map((row) => row.asset),
    ...pieces.flatMap((row) => (row.asset === null ? [] : [row.asset])),
  ];
  try {
    return transact(deps.db, (): PublicationResult => {
      const result = { originRevisionId: publication.work.revisionId, currentAttached: false };
      const authority = publicationAuthority(deps.db, publication);
      if (authority === undefined) return result;
      validatePublication(deps.db, publication, outputs, pieces);
      validateBundle(authority.key, outputs);
      if (isPublicationReplay(deps.db, publication, outputs, pieces)) return result;
      const targets = publicationTargets(
        deps.db,
        publication,
        authority.key,
        authority.fingerprint,
      );
      if (targets.length === 0) return result;
      for (const asset of assets) insertAsset(deps.db, asset);
      let currentAttached = false;
      for (const target of targets) {
        const revision = revisionById(deps.db, publication.work.projectId, target.revisionId);
        if (revision === undefined)
          throw new Error("Publication target disappeared inside its transaction.");
        const selected = target.selected;
        const before = outputsForRevision(deps.db, revision.projectId, revision.id);
        const exportAuthority = authority.key === "export:wav" || authority.key === "export:video";
        const selectsMember = (output: PreparedOutput): boolean => {
          if (!selected) return false;
          if (
            authority.key === "subtitles:files" &&
            (output.output.role === "audio_export" || output.output.role === "video")
          )
            return before.some(
              (row) =>
                row.selected &&
                row.state === "ready" &&
                row.workKey === output.workKey &&
                row.assetId === output.asset.id &&
                row.fingerprint === output.fingerprint,
            );
          if (!exportAuthority || output.workKey !== "subtitles:files") return true;
          if ((revision.config.subtitles?.mode ?? "off") === "off") return false;
          return (
            revision.fingerprints[output.workKey] === output.fingerprint ||
            before.some(
              (row) =>
                row.selected &&
                row.state === "ready" &&
                row.slot === output.slot &&
                row.assetId === output.asset.id &&
                row.fingerprint === output.fingerprint,
            )
          );
        };
        if (selected)
          for (const slot of replacementSlots(authority.key, outputs)) {
            const captionSlot = [
              "video:subtitles_srt",
              "video:subtitles_vtt",
              "video:subtitle_ass",
              "video:subtitle_font",
            ].includes(slot);
            if (
              exportAuthority &&
              captionSlot &&
              (revision.config.subtitles?.mode ?? "off") !== "off" &&
              !outputs.some((output) => output.slot === slot && selectsMember(output))
            )
              continue;
            deps.db
              .prepare("UPDATE revision_outputs SET selected=0 WHERE revision_id=? AND slot=?")
              .run(revision.id, slot);
          }
        for (const output of outputs) {
          const row: ManifestOutput = {
            slot: output.slot,
            workKey: output.workKey,
            assetId: output.asset.id,
            output: output.output,
            fingerprint: output.fingerprint,
            state: "ready",
          };
          const recordId = deps.ids.next();
          insertManifestOutput(
            deps.db,
            revision,
            target.revisionId === publication.work.revisionId
              ? row
              : positionedOutput(revision, row),
            recordId,
            publication.publicationId,
          );
          if (selectsMember(output)) selectOutputRecord(deps.db, revision.id, row.slot, recordId);
        }
        for (const piece of pieces) {
          const row: ManifestPiece = {
            key: piece.key,
            stageKind: piece.stageKind,
            assetId: piece.asset?.id ?? null,
            piece: piece.piece,
            fingerprint: piece.fingerprint,
          };
          const recordId = deps.ids.next();
          insertManifestPiece(
            deps.db,
            revision,
            target.revisionId === publication.work.revisionId
              ? row
              : positionedPiece(revision, row),
            recordId,
            publication.publicationId,
          );
          if (selected) selectPieceRecord(deps.db, revision.id, row.key, recordId);
        }
        if (selected && target.current) {
          projectSelected(deps.db, revision);
          currentAttached = true;
        }
      }
      return { ...result, currentAttached };
    });
  } finally {
    discardPreparedAssets(deps, assets);
  }
}
