import { statSync } from "node:fs";
import { z } from "zod";
import { type RunConfig, referenceKey, thumbnailCountOf } from "../admission/model.js";
import { type FieldError, usesReference } from "../admission/rules.js";
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
import { thumbnailOverrideOf } from "./model.js";

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
  if (to.kind === "shortsMusic") return { ...content, shortsMusic: assetId };
  if (to.kind === "thumbnail") {
    const variant = thumbnailOverrideOf(to.variant);
    if (variant === undefined) throw new Error("Validated thumbnail destination disappeared.");
    return {
      ...content,
      thumbnailOverrides: { ...content.thumbnailOverrides, [variant]: assetId },
    };
  }
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
      (to.kind === "provided" && !providesOwnFile(edit.config, to.stage)) ||
      (to.kind === "narration" && edit.config.sources.audio !== "generate") ||
      (to.kind === "image" && edit.config.sources.images === "off")
    )
      fields.push({
        field,
        message:
          "This section is off or not set to use your own file. Change the section's setting first, then add the file.",
      });
    if (
      to.kind === "thumbnail" &&
      (!generatesThumbnail(edit.config) || to.variant > thumbnailCountOf(edit.config))
    )
      fields.push({
        field,
        message:
          "This thumbnail is no longer one the project draws, so it can't take your file. Reload the project page and use Replace with my file on a thumbnail shown there.",
      });
    if (to.kind === "shortsMusic" && edit.config.shorts?.enabled !== true)
      fields.push({
        field,
        message:
          "Background music is only used by the shorts. Turn Shorts on in Edit project → Shorts, then add the music.",
      });
    const destination = JSON.stringify(to);
    if (staged.has(upload.stagedFileId) || destinations.has(destination))
      fields.push({
        field,
        message: "The same file or place is used twice. Remove the duplicate.",
      });
    staged.add(upload.stagedFileId);
    destinations.add(destination);
    const file = stagedFileById(deps.db, upload.stagedFileId);
    const kind =
      to.kind === "provided"
        ? to.stage === "reference"
          ? "images"
          : to.stage
        : to.kind === "image"
          ? "images"
          : to.kind === "thumbnail"
            ? "thumbnail"
            : "audio";
    if (
      file === undefined ||
      file.state !== "staged" ||
      file.stageKind !== kind ||
      !statSync(stagingPath(deps.paths, file.path), { throwIfNoEntry: false })?.isFile()
    )
      fields.push({
        field,
        message: "This upload is missing or has not finished. Upload the file again.",
      });
    if (to.kind === "image" && edit.content.imageDefinitions[to.imageKey] === undefined)
      fields.push({
        field,
        message: "This image is no longer in the project. Reload the page and choose again.",
      });
    if (to.kind === "narration" && !to.key.startsWith("audio:"))
      fields.push({
        field,
        message: "Choose which part of the narration this audio file replaces.",
      });
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
  for (const key of ["research", "article", "audio", "thumbnail", "reference"] as const) {
    const id = content.provided[key];
    if (id !== undefined) refs.push([`content.provided.${key}`, id, key, false]);
  }
  for (const [key, row] of Object.entries(content.imageDefinitions))
    if (row.assetId !== null)
      refs.push([`content.imageDefinitions.${key}.assetId`, row.assetId, "images", true]);
  for (const [key, row] of Object.entries(content.narrationOverrides))
    if (row.kind === "asset")
      refs.push([`content.narrationOverrides.${key}.assetId`, row.assetId, "audio", true]);
  for (const [variant, assetId] of Object.entries(content.thumbnailOverrides ?? {}))
    if (assetId !== undefined)
      refs.push([`content.thumbnailOverrides.${variant}`, assetId, "thumbnail", false]);
  const roles: Readonly<Record<ProvidedKind | "images", readonly OutputRole[]>> = {
    research: ["notes"],
    article: ["article_md", "article_txt"],
    audio: ["audio_body", "audio_intro", "audio_outro", "audio_export"],
    images: ["image"],
    thumbnail: ["thumbnail"],
    reference: ["reference"],
  };
  // The establishing image is the Images stage's.
  const stageOf = (kind: ProvidedKind | "images") => (kind === "reference" ? "images" : kind);
  for (const [field, id, kind, allowPiece] of refs) {
    if (
      !prepared.some((row) => row.id === id && row.projectId === projectId) &&
      deps.db
        .prepare("SELECT 1 FROM project_assets WHERE project_id=? AND id=?")
        .get(projectId, id) === undefined
    )
      fields.push({
        field,
        message: "This file does not belong to this project. Reload the page and choose again.",
      });
    if (
      !prepared.some((row) => row.id === id) &&
      deps.db
        .prepare(
          "SELECT 1 FROM revision_outputs WHERE project_id=? AND asset_id=? AND json_extract(descriptor,'$.stageKind')=? AND json_extract(descriptor,'$.role') IN (SELECT value FROM json_each(?))",
        )
        .get(projectId, id, stageOf(kind), JSON.stringify(roles[kind])) === undefined &&
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
          ) === undefined) &&
      !(
        kind === "audio" &&
        allowPiece &&
        deps.db
          .prepare(
            "SELECT 1 FROM project_revisions r, json_each(r.content, '$.narrationOverrides') o WHERE r.project_id=? AND json_extract(o.value,'$.kind')='asset' AND json_extract(o.value,'$.assetId')=? LIMIT 1",
          )
          .get(projectId, id) !== undefined
      )
    )
      fields.push({
        field,
        message: "This file cannot be used in this section. Choose a file of the right kind.",
      });
  }
  // The shorts' music is uploaded with this edit, or was this project's music before.
  const music = content.shortsMusic;
  if (
    music !== undefined &&
    !prepared.some((row) => row.id === music && row.projectId === projectId) &&
    deps.db
      .prepare(
        "SELECT 1 FROM project_revisions WHERE project_id=? AND json_extract(content,'$.shortsMusic')=? LIMIT 1",
      )
      .get(projectId, music) === undefined
  )
    fields.push({
      field: "content.shortsMusic",
      message:
        "This music file does not belong to this project. Reload the page and choose the music again.",
    });
  // The ambient bed's own file is only ever the one the project was started with.
  const bed = content.ambientBed;
  if (
    bed !== undefined &&
    deps.db
      .prepare(
        "SELECT 1 FROM project_revisions WHERE project_id=? AND json_extract(content,'$.ambientBed')=? LIMIT 1",
      )
      .get(projectId, bed) === undefined
  )
    fields.push({
      field: "content.ambientBed",
      message:
        "This ambient sound file does not belong to this project. Reload the page and save again.",
    });
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

// A thumbnail step that draws its thumbnails, so each can be replaced by a file of one's own.
export function generatesThumbnail(config: RunConfig): boolean {
  return config.sources.thumbnail === "from_prompt" || config.sources.thumbnail === "prompt_by_llm";
}

// A stage whose own file the project uses: Provide for audio and the thumbnail, Upload for the
// establishing image.
export function providesOwnFile(
  config: RunConfig,
  kind: "audio" | "thumbnail" | "reference",
): boolean {
  return kind === "reference"
    ? usesReference(config) && config.reference?.source === "provide"
    : config.sources[kind] === "provide";
}
// Where each provided file is published: its work key and output role.
export const providedOutput = {
  audio: { workKey: "audio:provided", role: "audio_body" },
  thumbnail: { workKey: "thumbnail:image", role: "thumbnail" },
  reference: { workKey: referenceKey, role: "reference" },
} as const;

export function providedAssetSelected(
  base: RevisionView,
  kind: "audio" | "thumbnail" | "reference",
  assetId: string,
): boolean {
  return (
    providesOwnFile(base.revision.config, kind) &&
    base.outputs.some(
      (row) =>
        row.selected &&
        row.assetId === assetId &&
        row.workKey === providedOutput[kind].workKey &&
        row.output.role === providedOutput[kind].role,
    )
  );
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
    ...Object.values(base.revision.content.thumbnailOverrides ?? {}),
  ]);
  for (const kind of ["audio", "thumbnail", "reference"] as const) {
    const assetId = edit.content.provided[kind];
    if (
      assetId !== undefined &&
      providesOwnFile(edit.config, kind) &&
      !providedAssetSelected(base, kind, assetId) &&
      !edit.uploads?.some(
        (row) => row.destination.kind === "provided" && row.destination.stage === kind,
      )
    )
      previous.delete(assetId);
  }
  const next = [
    ...Object.values(edit.content.provided),
    ...Object.values(edit.content.imageDefinitions).map((row) => row.assetId),
    ...Object.values(edit.content.narrationOverrides).flatMap((row) =>
      row.kind === "asset" ? [row.assetId] : [],
    ),
    ...Object.values(edit.content.thumbnailOverrides ?? {}),
  ];
  return next.flatMap((id) =>
    id == null ||
    previous.has(id) ||
    statSync(
      outputPath(deps.paths, base.revision.projectId, assetPath(deps, base.revision.projectId, id)),
      { throwIfNoEntry: false },
    )?.isFile()
      ? []
      : [{ field: "content", message: "The replacement file is missing. Upload it again." }],
  );
}
