import type { DatabaseSync } from "node:sqlite";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import type { PublicationRef } from "../../kernel/runner/work.js";
import { workExists } from "../../kernel/runner/work-authority.js";
import { pieceFile } from "../storage/reconcile.js";
import { outputSchema } from "../storage/schema.js";
import type { RevisionOutputRecord, RevisionPieceRecord } from "./model.js";
import type { PreparedOutput, PreparedPiece } from "./publication-model.js";
import { outputsForRevision, piecesForRevision, revisionById } from "./repo.js";
import { stagePieceSchema } from "./schema.js";

export function publicationAuthority(
  db: DatabaseSync,
  publication: PublicationRef,
): { readonly key: string; readonly fingerprint: string } | undefined {
  const { work, pieceId, publicationId } = publication;
  if (publicationId !== (pieceId ?? work.workId))
    throw new Error("Publication identity does not match its durable work.");
  if (!workExists(db, work)) return undefined;
  const row =
    pieceId === null
      ? db
          .prepare(
            "SELECT work_key,fingerprint FROM revision_work_reservations WHERE work_id=? AND piece_id IS NULL",
          )
          .get(work.workId)
      : db
          .prepare("SELECT work_key,fingerprint FROM revision_work_pieces WHERE work_id=? AND id=?")
          .get(work.workId, pieceId);
  if (row === undefined && pieceId === null) {
    const candidates = Object.entries(
      revisionById(db, work.projectId, work.revisionId)?.fingerprints ?? {},
    ).filter(([, value]) => value === work.fingerprint);
    const candidate = candidates.length === 1 ? candidates[0] : undefined;
    if (candidate !== undefined) return { key: candidate[0], fingerprint: candidate[1] };
  }
  if (row === undefined) throw new Error("Publication has no unambiguous durable authority.");
  const parsed = z.object({ work_key: z.string(), fingerprint: z.string() }).parse(row);
  return { key: parsed.work_key, fingerprint: parsed.fingerprint };
}
export function validatePublication(
  db: DatabaseSync,
  publication: PublicationRef,
  outputs: readonly PreparedOutput[],
  pieces: readonly PreparedPiece[],
): void {
  if (outputs.length + pieces.length === 0) throw new Error("A publication must contain a result.");
  if (
    new Set(outputs.map((row) => row.slot)).size !== outputs.length ||
    new Set(pieces.map((row) => row.key)).size !== pieces.length
  )
    throw new Error("Publication destinations must be unique.");
  const authority = publicationAuthority(db, publication);
  const durablePiece =
    publication.pieceId === null
      ? undefined
      : db
          .prepare("SELECT logical_fingerprint FROM revision_work_pieces WHERE id=? AND work_id=?")
          .get(publication.pieceId, publication.work.workId);
  const revision = revisionById(db, publication.work.projectId, publication.work.revisionId);
  for (const row of outputs) {
    const retainedMember =
      ((authority?.key === "subtitles:files" &&
        ((row.workKey === "export:wav" && row.output.role === "audio_export") ||
          (row.workKey === "export:video" &&
            row.output.role === "video" &&
            row.output.meta.subtitlesMode !== "burn-in"))) ||
        ((authority?.key === "export:wav" || authority?.key === "export:video") &&
          row.workKey === "subtitles:files" &&
          ["subtitles_srt", "subtitles_vtt", "subtitle_ass", "subtitle_font"].includes(
            row.output.role,
          ))) &&
      outputsForRevision(db, publication.work.projectId, publication.work.revisionId).some(
        (old) =>
          old.selected &&
          old.state === "ready" &&
          old.workKey === row.workKey &&
          old.output.role === row.output.role &&
          old.assetId === row.asset.id &&
          old.fingerprint === row.fingerprint,
      );
    if (
      !retainedMember &&
      row.fingerprint !== revision?.fingerprints[row.workKey] &&
      !(
        row.workKey === authority?.key &&
        (row.fingerprint === authority.fingerprint ||
          row.fingerprint === durablePiece?.logical_fingerprint)
      )
    )
      throw new Error("Output fingerprint differs from its authorized recipe.");
    outputSchema.parse(row.output);
    if (
      row.output.projectId !== publication.work.projectId ||
      row.asset.projectId !== publication.work.projectId ||
      row.output.stageKind !== publication.work.kind ||
      row.output.path !== row.asset.path ||
      row.output.bytes !== row.asset.bytes
    )
      throw new Error("Output descriptor does not match its owned asset and stage.");
  }
  for (const row of pieces) {
    stagePieceSchema.parse(row.piece);
    const owned = db
      .prepare("SELECT work_key,fingerprint FROM revision_work_pieces WHERE id=? AND work_id=?")
      .get(row.piece.id, publication.work.workId);
    const file = pieceFile(row.piece.payload);
    if (
      row.stageKind !== publication.work.kind ||
      row.piece.stageId !== publication.work.stageId ||
      owned === undefined ||
      owned.work_key !== row.key ||
      owned.fingerprint !== row.fingerprint ||
      (publication.pieceId !== null && row.piece.id !== publication.pieceId) ||
      (row.asset !== null &&
        (row.asset.projectId !== publication.work.projectId || file !== row.asset.path)) ||
      (row.asset === null && file !== undefined)
    )
      throw new Error("Piece descriptor does not match its owned work and asset.");
  }
}
export function isPublicationReplay(
  db: DatabaseSync,
  publication: PublicationRef,
  outputs: readonly PreparedOutput[],
  pieces: readonly PreparedPiece[],
): boolean {
  const oldOutputs = outputsForRevision(
    db,
    publication.work.projectId,
    publication.work.revisionId,
  ).filter((row) => row.publicationId === publication.publicationId);
  const oldPieces = piecesForRevision(
    db,
    publication.work.projectId,
    publication.work.revisionId,
  ).filter((row) => row.publicationId === publication.publicationId);
  if (oldOutputs.length + oldPieces.length === 0) return false;
  const descriptors = outputs.map((row) => ({
    slot: row.slot,
    workKey: row.workKey,
    assetId: row.asset.id,
    output: row.output,
    fingerprint: row.fingerprint,
    state: "ready",
  }));
  const pieceDescriptors = pieces.map((row) => ({
    key: row.key,
    stageKind: row.stageKind,
    assetId: row.asset?.id ?? null,
    piece: row.piece,
    fingerprint: row.fingerprint,
  }));
  const normalize = (rows: readonly unknown[]): readonly unknown[] =>
    rows
      .map((row) => JSON.parse(JSON.stringify(row)))
      .sort((a: unknown, b: unknown) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  if (
    !isDeepStrictEqual(normalize(oldOutputs.map(outputDescriptor)), normalize(descriptors)) ||
    !isDeepStrictEqual(normalize(oldPieces.map(pieceDescriptor)), normalize(pieceDescriptors))
  )
    throw new Error("Publication conflicts with its complete retained result.");
  return true;
}
function outputDescriptor({
  recordId: _recordId,
  publicationId: _publicationId,
  selected: _selected,
  ...row
}: RevisionOutputRecord): unknown {
  return row;
}
function pieceDescriptor({
  recordId: _recordId,
  publicationId: _publicationId,
  selected: _selected,
  ...row
}: RevisionPieceRecord): unknown {
  return row;
}

export function replacementSlots(
  authority: string,
  outputs: readonly PreparedOutput[],
): readonly string[] {
  if (authority === "article:body")
    return ["article:article_md", "article:article_txt", "article:sources", "article:glossary"];
  if (authority === "subtitles:files" || authority === "export:wav" || authority === "export:video")
    return [
      "video:subtitles_srt",
      "video:subtitles_vtt",
      "video:subtitle_ass",
      "video:subtitle_font",
      ...(authority === "subtitles:files"
        ? []
        : ["video:video", "video:audio_export", "video:render_params"]),
    ];
  return outputs.map((row) => row.slot);
}
export function validateBundle(authority: string, outputs: readonly PreparedOutput[]): void {
  const allowed = (row: PreparedOutput): boolean =>
    row.workKey === authority ||
    ((authority === "export:wav" || authority === "export:video") &&
      ["subtitles:files", "subtitles:cues"].includes(row.workKey)) ||
    (authority === "subtitles:files" &&
      ((row.workKey === "export:wav" && row.output.role === "audio_export") ||
        (row.workKey === "export:video" &&
          row.output.role === "video" &&
          row.output.meta.subtitlesMode !== "burn-in")));
  if (outputs.some((row) => !allowed(row)))
    throw new Error("Publication member is outside its authorized result bundle.");
  const roles = new Set(outputs.map((row) => row.output.role));
  const media = outputs.find(
    (row) => row.output.role === "video" || row.output.role === "audio_export",
  );
  if (
    (authority === "export:wav" && (!roles.has("audio_export") || !roles.has("render_params"))) ||
    (authority === "export:video" && (!roles.has("video") || !roles.has("render_params")))
  )
    throw new Error("Media and render parameters must publish as one complete bundle.");
  if (
    media !== undefined &&
    media.output.meta.subtitlesMode !== undefined &&
    media.output.meta.subtitlesMode !== "off"
  ) {
    if (
      !roles.has("subtitles_srt") ||
      !roles.has("subtitles_vtt") ||
      (media.output.meta.subtitlesMode === "burn-in" &&
        (!roles.has("subtitle_ass") || !roles.has("subtitle_font")))
    )
      throw new Error("Declared subtitle files must be committed with their media descriptor.");
  }
}
