import { statSync } from "node:fs";
import { z } from "zod";
import type { FieldError } from "../admission/rules.js";
import type { PreparedAsset } from "../storage/assets.js";
import { outputPath, stagingPath } from "../storage/layout.js";
import type { OutputRole } from "../storage/model.js";
import type { PreparedOutput } from "../storage/prepare.js";
import { stagedFileById } from "../storage/repo.js";
import type {
  ProvidedKind,
  RevisionContent,
  RevisionDeps,
  RevisionEdit,
  RevisionUpload,
  RevisionView,
} from "./model.js";

export interface PreparedEditAsset extends PreparedOutput {
  readonly workKey: string;
  readonly slot: string;
  readonly upload?: RevisionUpload;
  readonly stagedSource?: string;
}
export function bindUpload(
  content: RevisionContent,
  upload: RevisionUpload,
  assetId: string,
): RevisionContent {
  const to = upload.destination;
  if (to.kind === "provided")
    return { ...content, provided: { ...content.provided, [to.stage]: assetId } };
  if (to.kind === "narration")
    return {
      ...content,
      narrationOverrides: { ...content.narrationOverrides, [to.key]: { kind: "asset", assetId } },
    };
  const image = content.imageDefinitions[to.imageKey];
  if (image === undefined) throw new Error("Validated image destination disappeared.");
  return {
    ...content,
    imageDefinitions: {
      ...content.imageDefinitions,
      [to.imageKey]: { ...image, source: "provide", assetId, prompt: null, templateKey: null },
    },
  };
}
export function validateUploads(deps: RevisionDeps, edit: RevisionEdit): readonly FieldError[] {
  const fields: FieldError[] = [];
  const staged = new Set<string>();
  const destinations = new Set<string>();
  for (const [index, upload] of (edit.uploads ?? []).entries()) {
    const field = `uploads.${index}`;
    const to = upload.destination;
    if (
      (to.kind === "provided" && edit.config.sources[to.stage] !== "provide") ||
      (to.kind === "narration" && edit.config.sources.audio !== "generate") ||
      (to.kind === "image" && edit.config.sources.images === "off")
    )
      fields.push({
        field,
        message:
          "Enable the corresponding provided or generated content before importing this file.",
      });
    const destination = JSON.stringify(to);
    if (staged.has(upload.stagedFileId) || destinations.has(destination))
      fields.push({ field, message: "Each upload and destination must be unique." });
    staged.add(upload.stagedFileId);
    destinations.add(destination);
    const file = stagedFileById(deps.db, upload.stagedFileId);
    const kind = to.kind === "provided" ? to.stage : to.kind === "image" ? "images" : "audio";
    if (
      file === undefined ||
      file.state !== "staged" ||
      file.stageKind !== kind ||
      !statSync(stagingPath(deps.paths, file.path), { throwIfNoEntry: false })?.isFile()
    )
      fields.push({ field, message: "Choose a completed upload for this stage." });
    if (to.kind === "image" && edit.content.imageDefinitions[to.imageKey] === undefined)
      fields.push({ field, message: "Choose an image in this revision." });
    if (to.kind === "narration" && !to.key.startsWith("audio:"))
      fields.push({ field, message: "Choose a narration segment." });
  }
  return fields;
}
export function validateAssetReferences(
  deps: RevisionDeps,
  projectId: string,
  content: RevisionContent,
  prepared: readonly PreparedAsset[],
): readonly FieldError[] {
  const fields: FieldError[] = [];
  const refs: [string, string, ProvidedKind | "images", boolean][] = [];
  for (const key of ["research", "article", "audio", "thumbnail"] as const) {
    const id = content.provided[key];
    if (id !== undefined) refs.push([`content.provided.${key}`, id, key, false]);
  }
  for (const [key, row] of Object.entries(content.imageDefinitions))
    if (row.assetId !== null)
      refs.push([`content.imageDefinitions.${key}.assetId`, row.assetId, "images", true]);
  for (const [key, row] of Object.entries(content.narrationOverrides))
    if (row.kind === "asset")
      refs.push([`content.narrationOverrides.${key}.assetId`, row.assetId, "audio", true]);
  const roles: Readonly<Record<ProvidedKind | "images", readonly OutputRole[]>> = {
    research: ["notes"],
    article: ["article_md", "article_txt"],
    audio: ["audio_body", "audio_intro", "audio_outro", "audio_export"],
    images: ["image"],
    thumbnail: ["thumbnail"],
  };
  for (const [field, id, kind, allowPiece] of refs) {
    if (
      !prepared.some((row) => row.id === id && row.projectId === projectId) &&
      deps.db
        .prepare("SELECT 1 FROM project_assets WHERE project_id=? AND id=?")
        .get(projectId, id) === undefined
    )
      fields.push({ field, message: "Choose an asset belonging to this project." });
    if (
      !prepared.some((row) => row.id === id) &&
      deps.db
        .prepare(
          "SELECT 1 FROM revision_outputs WHERE project_id=? AND asset_id=? AND json_extract(descriptor,'$.stageKind')=? AND json_extract(descriptor,'$.role') IN (SELECT value FROM json_each(?))",
        )
        .get(projectId, id, kind, JSON.stringify(roles[kind])) === undefined &&
      (!allowPiece ||
        deps.db
          .prepare(
            "SELECT 1 FROM revision_pieces WHERE project_id=? AND asset_id=? AND stage_kind=? AND json_extract(descriptor,'$.kind') IN (SELECT value FROM json_each(?))",
          )
          .get(
            projectId,
            id,
            kind,
            JSON.stringify(kind === "audio" ? ["chunk", "segment"] : ["image"]),
          ) === undefined)
    )
      fields.push({ field, message: "Choose an asset for this content stage." });
  }
  return fields;
}
export async function measureAudio(
  deps: RevisionDeps,
  projectId: string,
  path: string,
): Promise<number> {
  if (deps.measureAudio === undefined) throw new Error("Audio inspection is unavailable.");
  const duration = await deps.measureAudio(outputPath(deps.paths, projectId, path));
  if (!Number.isFinite(duration) || duration < 0)
    throw new Error("Audio inspection returned an invalid duration.");
  return duration;
}
export function assetPath(deps: RevisionDeps, projectId: string, id: string): string {
  return z
    .object({ path: z.string() })
    .parse(
      deps.db
        .prepare("SELECT path FROM project_assets WHERE project_id=? AND id=?")
        .get(projectId, id),
    ).path;
}

export function validateReplacementAvailability(
  deps: RevisionDeps,
  base: RevisionView,
  edit: RevisionEdit,
): readonly FieldError[] {
  const previous = new Set([
    ...Object.values(base.revision.content.provided),
    ...Object.values(base.revision.content.imageDefinitions).map((row) => row.assetId),
    ...Object.values(base.revision.content.narrationOverrides).flatMap((row) =>
      row.kind === "asset" ? [row.assetId] : [],
    ),
  ]);
  const next = [
    ...Object.values(edit.content.provided),
    ...Object.values(edit.content.imageDefinitions).map((row) => row.assetId),
    ...Object.values(edit.content.narrationOverrides).flatMap((row) =>
      row.kind === "asset" ? [row.assetId] : [],
    ),
  ];
  return next.flatMap((id) =>
    id == null ||
    previous.has(id) ||
    statSync(
      outputPath(deps.paths, base.revision.projectId, assetPath(deps, base.revision.projectId, id)),
      { throwIfNoEntry: false },
    )?.isFile()
      ? []
      : [{ field: "content", message: "The replacement asset is missing. Upload it again." }],
  );
}
