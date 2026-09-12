import { writeAsset } from "../storage/assets.js";
import type { OutputRole } from "../storage/model.js";
import type { ManifestOutput, ManifestPiece, ProjectRevision, RevisionDeps } from "./model.js";
import {
  insertAsset,
  insertManifestOutput,
  insertManifestPiece,
  selectOutputRecord,
} from "./repo.js";

export function retainedOutput(
  deps: RevisionDeps,
  revision: ProjectRevision,
  role: OutputRole,
  filename: string,
  body: string,
  key: string = role,
  selected = true,
): { readonly recordId: string; readonly row: ManifestOutput } {
  const asset = writeAsset(deps, revision.projectId, filename, Buffer.from(body));
  insertAsset(deps.db, asset);
  const row: ManifestOutput = {
    slot: key,
    workKey: key,
    assetId: asset.id,
    fingerprint: "retained",
    state: "ready",
    output: {
      id: deps.ids.next(),
      projectId: revision.projectId,
      stageKind: role === "image" ? "images" : role === "thumbnail" ? "thumbnail" : "video",
      role,
      path: asset.path,
      originalFilename: null,
      bytes: asset.bytes,
      durationMs: null,
      meta: role === "image" ? { index: 99 } : {},
      createdAt: asset.createdAt,
    },
  };
  const recordId = deps.ids.next();
  insertManifestOutput(deps.db, revision, row, recordId);
  if (selected) selectOutputRecord(deps.db, revision.id, key, recordId);
  return { recordId, row };
}

export function retainedPiece(
  deps: RevisionDeps,
  revision: ProjectRevision,
  body: string | null,
): { readonly recordId: string; readonly row: ManifestPiece } {
  const asset =
    body === null ? null : writeAsset(deps, revision.projectId, "chunk.mp3", Buffer.from(body));
  if (asset !== null) insertAsset(deps.db, asset);
  const row: ManifestPiece = {
    key: `audio:body:${deps.ids.next()}`,
    stageKind: "audio",
    assetId: asset?.id ?? null,
    fingerprint: "retained",
    piece: {
      id: deps.ids.next(),
      stageId: "historical-audio",
      kind: "chunk",
      idx: 1,
      state: "done",
      payload: JSON.stringify({ text: "Original narration", file: "untrusted.mp3" }),
    },
  };
  const recordId = deps.ids.next();
  insertManifestPiece(deps.db, revision, row, recordId);
  return { recordId, row };
}
