import { z } from "zod";
import { thumbnailKey, thumbnailVariant } from "../admission/model.js";
import { plainText } from "../article/plain.js";
import { splitEndMatter } from "../article/split.js";
import { normalizeArticleIntent } from "../rebuild/recipe-save.js";
import { discardPreparedAssets, type PreparedAsset } from "../storage/assets.js";
import type { OutputRole } from "../storage/model.js";
import { prepareStagedFile, prepareText } from "../storage/prepare.js";
import { outputSchema } from "../storage/schema.js";
import {
  type RevisionContent,
  type RevisionDeps,
  type RevisionEdit,
  type RevisionView,
  thumbnailOverrideOf,
} from "./model.js";
import {
  bindUpload,
  measureAudio,
  type PreparedEditAsset,
  providedAssetSelected,
  providedOutput,
  providesOwnFile,
} from "./mutation-assets.js";

export interface PreparedEdit {
  readonly edit: RevisionEdit;
  readonly assets: readonly PreparedEditAsset[];
}
export async function prepareEditAssets(
  deps: RevisionDeps,
  base: RevisionView,
  edit: RevisionEdit,
): Promise<PreparedEdit> {
  const prepared: PreparedEditAsset[] = [];
  const allocated: PreparedAsset[] = [];
  try {
    const projectId = base.revision.projectId;
    let content = remadeThumbnails(normalizeArticleIntent(base, edit), edit);
    for (const upload of edit.uploads ?? []) {
      const to = upload.destination;
      const role =
        to.kind === "image"
          ? "image"
          : to.kind === "thumbnail"
            ? "thumbnail"
            : to.kind === "provided" && to.stage !== "audio"
              ? providedOutput[to.stage].role
              : "audio_body";
      const result = prepareStagedFile(deps, {
        projectId,
        stagedFileId: upload.stagedFileId,
        role,
        index:
          to.kind === "image"
            ? content.imageOrder.indexOf(to.imageKey) + 1
            : to.kind === "thumbnail"
              ? to.variant
              : 1,
      });
      if (!result.ok) throw new Error("A validated upload became unavailable.");
      // The shorts' music is an asset the revision names, like a narration replacement,
      // never an output of its own.
      const workKey =
        to.kind === "image"
          ? `image:${to.imageKey}`
          : to.kind === "narration"
            ? to.key
            : to.kind === "shortsMusic"
              ? "shorts:music"
              : to.kind === "thumbnail"
                ? thumbnailKey(to.variant)
                : providedOutput[to.stage].workKey;
      // The first thumbnail keeps the slot a thumbnail always had; the second and third have
      // their own, as when they are drawn (`rebuild/runtime-publication.ts`).
      const ownSlot =
        to.kind === "image" ||
        to.kind === "narration" ||
        to.kind === "shortsMusic" ||
        (to.kind === "thumbnail" && to.variant > 1);
      const item: PreparedEditAsset = {
        ...result,
        upload,
        workKey,
        slot: ownSlot ? workKey : `${result.output.stageKind}:${role}`,
        // The second and third thumbnails carry their number; the first carries none, as when
        // they are drawn.
        ...(to.kind === "thumbnail" && to.variant > 1
          ? { output: { ...result.output, meta: { ...result.output.meta, index: to.variant } } }
          : {}),
      };
      allocated.push(result.asset);
      const durationMs =
        result.output.stageKind === "audio"
          ? await measureAudio(deps, projectId, result.asset.path)
          : item.output.durationMs;
      prepared.push({ ...item, output: { ...item.output, durationMs } });
      content = bindUpload(content, upload, result.asset.id);
    }
    for (const [index, key] of content.imageOrder.entries()) {
      const definition = content.imageDefinitions[key];
      const assetId = definition?.assetId;
      const workKey = `image:${key}`;
      if (
        definition?.source !== "provide" ||
        assetId == null ||
        prepared.some((row) => row.workKey === workKey) ||
        base.outputs.some(
          (row) =>
            row.selected &&
            row.workKey === workKey &&
            row.assetId === assetId &&
            row.output.role === "image",
        )
      )
        continue;
      const asset = retainedAsset(deps, projectId, assetId);
      const existing = deps.db
        .prepare(
          "SELECT descriptor FROM revision_outputs WHERE project_id=? AND asset_id=? AND json_extract(descriptor,'$.stageKind')='images' AND json_extract(descriptor,'$.role')='image' LIMIT 1",
        )
        .get(projectId, assetId);
      const descriptor =
        existing === undefined
          ? {
              projectId,
              stageKind: "images" as const,
              role: "image" as const,
              path: asset.path,
              originalFilename: null,
              bytes: asset.bytes,
              durationMs: null,
              meta: {},
              createdAt: asset.createdAt,
            }
          : outputSchema.parse(JSON.parse(z.string().parse(existing.descriptor)));
      prepared.push({
        asset,
        output: {
          ...descriptor,
          id: deps.ids.next(),
          meta: { ...descriptor.meta, index: index + 1 },
        },
        workKey,
        slot: workKey,
      });
    }
    for (const kind of ["audio", "thumbnail", "reference"] as const) {
      const assetId = content.provided[kind];
      if (
        !providesOwnFile(edit.config, kind) ||
        assetId === undefined ||
        providedAssetSelected(base, kind, assetId) ||
        prepared.some((row) => row.asset.id === assetId)
      )
        continue;
      const existing = deps.db
        .prepare(
          "SELECT descriptor FROM revision_outputs WHERE project_id=? AND asset_id=? AND json_extract(descriptor,'$.stageKind')=? LIMIT 1",
        )
        .get(projectId, assetId, kind === "reference" ? "images" : kind);
      if (existing === undefined) throw new Error("Validated replacement asset has no descriptor.");
      const descriptor = outputSchema.parse(JSON.parse(z.string().parse(existing.descriptor)));
      const asset = retainedAsset(deps, projectId, assetId);
      const role = providedOutput[kind].role;
      const item: PreparedEditAsset = {
        asset,
        output: {
          ...descriptor,
          id: deps.ids.next(),
          role,
          durationMs:
            kind === "audio"
              ? await measureAudio(deps, projectId, asset.path)
              : descriptor.durationMs,
        },
        workKey: kind === "audio" ? "audio:provided" : "thumbnail:image",
        slot: `${kind}:${role}`,
      };
      prepared.push(item);
    }
    const article =
      edit.config.sources.article !== "generate" || content.articleEdited === true
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
          allocated.push(row.asset);
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
      allocated.push(row.asset);
      prepared.push({ ...row, workKey: "research:notes", slot: "research:notes" });
    }
    return { edit: { ...edit, content }, assets: prepared };
  } catch (error) {
    discardPreparedAssets(deps, allocated);
    throw error;
  }
}

// Remaking a thumbnail that was replaced by the person's own file draws it again: the edit's
// regenerate list names it, and no new file for it comes with the edit.
function remadeThumbnails(content: RevisionContent, edit: RevisionEdit): RevisionContent {
  const overrides = { ...content.thumbnailOverrides };
  for (const key of edit.regenerate ?? []) {
    const variant = thumbnailVariant(key);
    const slot = variant === undefined ? undefined : thumbnailOverrideOf(variant);
    if (
      slot !== undefined &&
      !edit.uploads?.some(
        (one) => one.destination.kind === "thumbnail" && one.destination.variant === variant,
      )
    )
      delete overrides[slot];
  }
  if (content.thumbnailOverrides === undefined) return content;
  const { thumbnailOverrides: _dropped, ...rest } = content;
  return Object.keys(overrides).length === 0 ? rest : { ...rest, thumbnailOverrides: overrides };
}

function retainedAsset(deps: RevisionDeps, projectId: string, assetId: string): PreparedAsset {
  const row = z
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
  return {
    id: row.id,
    projectId: row.project_id,
    path: row.path,
    bytes: row.bytes,
    createdAt: row.created_at,
  };
}
