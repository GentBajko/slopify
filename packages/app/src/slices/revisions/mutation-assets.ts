import { statSync } from "node:fs";
import { z } from "zod";
import type { FieldError } from "../admission/rules.js";
import { plainText } from "../article/plain.js";
import { splitEndMatter } from "../article/split.js";
import { normalizeArticleIntent } from "../rebuild/recipe-save.js";
import type { PreparedAsset } from "../storage/assets.js";
import { outputPath, stagingPath } from "../storage/layout.js";
import type { OutputRole } from "../storage/model.js";
import { type PreparedOutput, prepareStagedFile, prepareText } from "../storage/prepare.js";
import { stagedFileById } from "../storage/repo.js";
import { outputSchema } from "../storage/schema.js";
import type {
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
  const refs: [string, string][] = [];
  for (const [key, id] of Object.entries(content.provided))
    if (id !== undefined) refs.push([`content.provided.${key}`, id]);
  for (const [key, row] of Object.entries(content.imageDefinitions))
    if (row.assetId !== null) refs.push([`content.imageDefinitions.${key}.assetId`, row.assetId]);
  for (const [key, row] of Object.entries(content.narrationOverrides))
    if (row.kind === "asset") refs.push([`content.narrationOverrides.${key}.assetId`, row.assetId]);
  for (const [field, id] of refs) {
    if (
      !prepared.some((row) => row.id === id && row.projectId === projectId) &&
      deps.db
        .prepare("SELECT 1 FROM project_assets WHERE project_id=? AND id=?")
        .get(projectId, id) === undefined
    )
      fields.push({ field, message: "Choose an asset belonging to this project." });
    const kind = field.startsWith("content.imageDefinitions")
      ? "images"
      : field.startsWith("content.narrationOverrides")
        ? "audio"
        : field.split(".")[2];
    if (
      !prepared.some((row) => row.id === id) &&
      deps.db
        .prepare(
          "SELECT 1 FROM revision_outputs WHERE project_id=? AND asset_id=? AND json_extract(descriptor,'$.stageKind')=? UNION ALL SELECT 1 FROM revision_pieces WHERE project_id=? AND asset_id=? AND stage_kind=?",
        )
        .get(projectId, id, kind ?? "", projectId, id, kind ?? "") === undefined
    )
      fields.push({ field, message: "Choose an asset for this content stage." });
  }
  return fields;
}
export async function prepareEditAssets(
  deps: RevisionDeps,
  base: RevisionView,
  edit: RevisionEdit,
  prepared: PreparedEditAsset[],
): Promise<RevisionEdit> {
  const projectId = base.revision.projectId;
  let content = normalizeArticleIntent(base, edit);
  for (const upload of edit.uploads ?? []) {
    const to = upload.destination;
    const role =
      to.kind === "image"
        ? "image"
        : to.kind === "provided" && to.stage === "thumbnail"
          ? "thumbnail"
          : "audio_body";
    const result = prepareStagedFile(deps, {
      projectId,
      stagedFileId: upload.stagedFileId,
      role,
      index: to.kind === "image" ? content.imageOrder.indexOf(to.imageKey) + 1 : 1,
    });
    if (!result.ok) throw new Error("A validated upload became unavailable.");
    const workKey =
      to.kind === "image"
        ? `image:${to.imageKey}`
        : to.kind === "narration"
          ? to.key
          : to.stage === "audio"
            ? "audio:provided"
            : "thumbnail:image";
    const item: PreparedEditAsset = {
      ...result,
      upload,
      workKey,
      slot:
        to.kind === "image"
          ? workKey
          : to.kind === "narration"
            ? workKey
            : `${result.output.stageKind}:${role}`,
    };
    prepared.push(item);
    if (result.output.stageKind === "audio") {
      const durationMs = await measureAudio(deps, projectId, result.asset.path);
      prepared[prepared.length - 1] = { ...item, output: { ...item.output, durationMs } };
    }
    content = bindUpload(content, upload, result.asset.id);
  }
  for (const kind of ["audio", "thumbnail"] as const) {
    const assetId = content.provided[kind];
    if (
      assetId === undefined ||
      assetId === base.revision.content.provided[kind] ||
      prepared.some((row) => row.asset.id === assetId)
    )
      continue;
    const existing = deps.db
      .prepare(
        "SELECT descriptor FROM revision_outputs WHERE project_id=? AND asset_id=? AND json_extract(descriptor,'$.stageKind')=? LIMIT 1",
      )
      .get(projectId, assetId, kind);
    if (existing === undefined) throw new Error("Validated replacement asset has no descriptor.");
    const descriptor = outputSchema.parse(JSON.parse(z.string().parse(existing.descriptor)));
    const asset = z
      .object({
        id: z.string(),
        project_id: z.string(),
        path: z.string(),
        bytes: z.number(),
        created_at: z.string(),
      })
      .parse(
        deps.db
          .prepare("SELECT * FROM project_assets WHERE project_id=? AND id=?")
          .get(projectId, assetId),
      );
    const item: PreparedEditAsset = {
      asset: {
        id: asset.id,
        projectId: asset.project_id,
        path: asset.path,
        bytes: asset.bytes,
        createdAt: asset.created_at,
      },
      output: {
        ...descriptor,
        id: deps.ids.next(),
        durationMs:
          kind === "audio"
            ? await measureAudio(deps, projectId, asset.path)
            : descriptor.durationMs,
      },
      workKey: kind === "audio" ? "audio:provided" : "thumbnail:image",
      slot: `${kind}:${kind === "audio" ? "audio_body" : "thumbnail"}`,
    };
    prepared.push(item);
  }
  const article =
    edit.config.sources.article === "provide" || content.articleEdited === true
      ? (content.articleMarkdown ?? edit.config.provided.article)
      : undefined;
  if (
    article !== undefined &&
    (article !== base.articleMarkdown ||
      !base.outputs.some(
        (row) => row.selected && row.available && row.output.role === "article_md",
      ))
  ) {
    const end = splitEndMatter(article);
    const texts: readonly [OutputRole, string][] = [
      ["article_md", article],
      ["article_txt", plainText(end.body)],
      ["sources", end.sources],
      ["glossary", end.glossary],
    ];
    for (const [role, text] of texts)
      if (text.trim() !== "" || role === "article_md" || role === "article_txt") {
        const row = prepareText(deps, { projectId, stageKind: "article", role, text });
        prepared.push({ ...row, workKey: "article:body", slot: `article:${role}` });
      }
  }
  if (
    edit.config.sources.research === "provide" &&
    (edit.config.provided.research !== base.revision.config.provided.research ||
      !base.outputs.some((row) => row.selected && row.output.role === "notes"))
  ) {
    const row = prepareText(deps, {
      projectId,
      stageKind: "research",
      role: "notes",
      text: edit.config.provided.research ?? "",
    });
    prepared.push({ ...row, workKey: "research:notes", slot: "research:notes" });
  }
  return { ...edit, content };
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
