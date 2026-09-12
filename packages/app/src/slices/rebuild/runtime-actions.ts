import type { CatalogueStore } from "../../catalog/store.js";
import type { StageKind } from "../../kernel/pipeline.js";
import type { RerunResult } from "../reruns/index.js";
import type { RevisionDeps } from "../revisions/model.js";
import { saveRevision } from "../revisions/mutations.js";
import { currentRevisionId } from "../revisions/repo.js";
import { getRevisionView } from "../revisions/view.js";
import { projectStandings } from "./runtime-store.js";

export interface RuntimeActionDeps extends RevisionDeps {
  readonly catalogue?: CatalogueStore | undefined;
}
export type RevisionAction =
  | { readonly kind: "retry" | "rerun"; readonly stage: StageKind }
  | { readonly kind: "article"; readonly markdown: string }
  | { readonly kind: "delete-image" | "regenerate-image"; readonly outputId: string };

export async function revisionAction(
  deps: RuntimeActionDeps,
  projectId: string,
  action: RevisionAction,
): Promise<RerunResult> {
  const revisionId = currentRevisionId(deps.db, projectId);
  const view = revisionId === undefined ? undefined : getRevisionView(deps, projectId, revisionId);
  if (view === undefined) return { ok: false, reason: "no-project" };
  if (action.kind === "retry") return { ok: false, reason: "rebuild-required" };
  const config = view.revision.config;
  const content = view.revision.content;
  const image =
    action.kind === "delete-image" || action.kind === "regenerate-image"
      ? view.outputs.find(
          (row) => row.selected && row.output.id === action.outputId && row.output.role === "image",
        )
      : undefined;
  if ((action.kind === "delete-image" || action.kind === "regenerate-image") && image === undefined)
    return { ok: false, reason: "unknown-image" };
  const imageKey = image?.workKey.slice(6);
  if (action.kind === "article" && action.markdown.trim() === "")
    return { ok: false, reason: "empty-article" };
  const regenerate =
    action.kind === "rerun"
      ? Object.keys(view.revision.fingerprints).filter((key) => keyStage(key) === action.stage)
      : action.kind === "regenerate-image" && image !== undefined
        ? [image.workKey]
        : undefined;
  const nextContent =
    action.kind === "article"
      ? { ...content, articleMarkdown: action.markdown, articleEdited: true }
      : action.kind === "delete-image"
        ? {
            ...content,
            imageOrder: content.imageOrder.filter((key) => key !== imageKey),
            imageDefinitions: Object.fromEntries(
              Object.entries(content.imageDefinitions).filter(([key]) => key !== imageKey),
            ),
          }
        : content;
  const nextConfig =
    action.kind === "delete-image" && nextContent.imageOrder.length === 0
      ? {
          ...config,
          sources: { ...config.sources, images: "off" as const, video: "off" as const },
          ...(config.subtitles?.mode === "burn-in"
            ? { subtitles: { ...config.subtitles, mode: "files" as const } }
            : {}),
        }
      : config;
  const saved = await saveRevision(deps, {
    projectId,
    baseRevisionId: view.revision.id,
    idempotencyKey: deps.ids.next(),
    edit: {
      config: nextConfig,
      content: nextContent,
      ...(regenerate === undefined ? {} : { regenerate }),
    },
  });
  if (!saved.ok) return { ok: false, reason: "not-rerunnable" };
  projectStandings(deps, projectId);
  return {
    ok: true,
    redone: [],
  };
}
function keyStage(key: string): StageKind {
  const prefix = key.split(":")[0];
  if (prefix === "entry" || prefix === "article") return "article";
  if (prefix === "image") return "images";
  if (prefix === "audio") return "audio";
  if (prefix === "thumbnail") return "thumbnail";
  if (prefix === "research") return "research";
  return "video";
}
