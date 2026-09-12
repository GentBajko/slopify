import { z } from "zod";
import { plainText } from "../article/plain.js";
import { splitEndMatter } from "../article/split.js";
import { normalizeArticleIntent } from "../rebuild/recipe-save.js";
import { discardPreparedAssets, type PreparedAsset } from "../storage/assets.js";
import type { OutputRole } from "../storage/model.js";
import { prepareStagedFile, prepareText } from "../storage/prepare.js";
import { outputSchema } from "../storage/schema.js";
import type { RevisionDeps, RevisionEdit, RevisionView } from "./model.js";
import { bindUpload, measureAudio, type PreparedEditAsset } from "./mutation-assets.js";

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
      const asset = retainedAsset(deps, projectId, assetId);
      const role = kind === "audio" ? "audio_body" : "thumbnail";
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
