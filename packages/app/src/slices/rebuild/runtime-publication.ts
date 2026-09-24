import { transact } from "../../kernel/db/tx.js";
import type { StageContext } from "../../kernel/runner/index.js";
import type { StagePiece } from "../../kernel/runner/piece-repo.js";
import { fingerprint } from "../../kernel/runner/work.js";
import type { RevisionDeps } from "../revisions/model.js";
import type { PreparedOutput, PreparedPiece } from "../revisions/publication-model.js";
import { publicationAuthority } from "../revisions/publication-rules.js";
import { commitRevisionOutputs } from "../revisions/publish.js";
import { insertAsset, insertManifestOutput, revisionById } from "../revisions/repo.js";
import type { PreparedAsset } from "../storage/assets.js";
import { discardPreparedAssets, writeAsset } from "../storage/assets.js";
import type { OutputMeta, OutputRole } from "../storage/model.js";
import { executionPlan, executionView, savedCatalogue } from "./runtime-plan.js";
import type { WorkPiece } from "./work-records.js";

export function preparedResult(
  deps: RevisionDeps,
  context: StageContext,
  piece: WorkPiece,
  role: OutputRole,
  asset: PreparedAsset,
  durationMs: number | null = null,
  meta: OutputMeta = {},
): PreparedOutput {
  return {
    slot: role === "image" ? piece.key : `${context.work.kind}:${role}`,
    workKey: piece.key,
    fingerprint: piece.logicalFingerprint ?? piece.fingerprint,
    asset,
    output: {
      id: deps.ids.next(),
      projectId: context.work.projectId,
      stageKind: context.work.kind,
      role,
      path: asset.path,
      originalFilename: null,
      bytes: asset.bytes,
      durationMs,
      meta,
      createdAt: asset.createdAt,
    },
  };
}
export function preparedText(
  deps: RevisionDeps,
  context: StageContext,
  piece: WorkPiece,
  role: OutputRole,
  filename: string,
  text: string,
): PreparedOutput {
  const output = preparedTexts(deps, context, piece, [[role, filename, text]])[0];
  if (output === undefined) throw new Error("The text output was not prepared.");
  return output;
}

export function preparedTexts(
  deps: RevisionDeps,
  context: StageContext,
  piece: WorkPiece,
  texts: readonly (readonly [OutputRole, string, string])[],
): PreparedOutput[] {
  const assets: PreparedAsset[] = [];
  try {
    return texts.map(([role, filename, text]) => {
      const asset = writeAsset(deps, context.work.projectId, filename, Buffer.from(text));
      assets.push(asset);
      return preparedResult(deps, context, piece, role, asset);
    });
  } catch (error) {
    discardPreparedAssets(deps, assets);
    throw error;
  }
}

export async function publishResult(
  deps: RevisionDeps,
  context: StageContext,
  piece: WorkPiece,
  outputs: readonly PreparedOutput[],
  payload: Readonly<Record<string, unknown>>,
  asset: PreparedAsset | null = null,
): Promise<void> {
  try {
    const record: PreparedPiece = {
      key: piece.key,
      stageKind: context.work.kind,
      asset,
      fingerprint: piece.fingerprint,
      piece: {
        id: piece.id,
        stageId: context.work.stageId,
        kind: pieceKind(piece),
        idx: pieceIndex(deps, context, piece),
        state: "done",
        payload: JSON.stringify({
          ...payload,
          requestFingerprint: piece.requestFingerprint,
          ...(asset === null ? {} : { file: asset.path }),
        }),
      },
    };
    const result = await commitRevisionOutputs(
      deps,
      { work: context.work, pieceId: piece.id, publicationId: piece.id },
      outputs,
      [record],
    );
    deps.db
      .prepare("UPDATE revision_work_pieces SET state='done' WHERE id=? AND work_id=?")
      .run(piece.id, context.work.workId);
    if (result.currentAttached)
      context.emit({ type: "project.updated", projectId: context.work.projectId });
  } finally {
    discardPreparedAssets(deps, [
      ...outputs.map((output) => output.asset),
      ...(asset === null ? [] : [asset]),
    ]);
  }
}
function pieceKind(piece: WorkPiece): StagePiece["kind"] {
  if (piece.input.kind === "llm" && piece.input.preparation !== undefined) return "prompt_written";
  if (piece.input.kind === "tts") return piece.input.segment === "body" ? "chunk" : "segment";
  if (piece.input.kind === "provided" && /^audio:body:.+:\d+$/.test(piece.key)) return "chunk";
  if (piece.input.kind === "provided" && /^audio:(intro|outro):\d+$/.test(piece.key))
    return "segment";
  if (piece.key.startsWith("image:")) return "image";
  if (piece.key.startsWith("research:chapter:")) return "chapter";
  if (piece.key.startsWith("entry:")) return "segment";
  if (piece.key === "research:planner" || piece.key === "thumbnail:prompt") return "prompt_written";
  return "article_written";
}
function pieceIndex(deps: RevisionDeps, context: StageContext, piece: WorkPiece): number {
  if (piece.input.kind === "llm" && piece.input.preparation?.segment === "intro") return 1;
  if (piece.input.kind === "llm" && piece.input.preparation?.segment === "outro") return 2;
  // Intro and outro can resolve independently. Reserve alternating ordinals so a
  // late intro part cannot collide with an outro that was already published.
  const segment = /^audio:(intro|outro):(\d+)$/.exec(piece.key);
  if (segment !== null) return Number(segment[2]) * 2 - (segment[1] === "intro" ? 1 : 0);
  if (piece.key === "entry:intro:text") return 1;
  if (piece.key === "entry:outro:text") return 2;
  const localOrder = [
    "audio:body:concat",
    "audio:intro",
    "audio:outro",
    "audio:provided",
    "subtitles:timing",
    "subtitles:cues",
    "subtitles:files",
    "export:wav",
    "export:video",
    "narration:files:body",
    "narration:files:intro",
    "narration:files:outro",
  ];
  const localIndex = localOrder.indexOf(piece.key);
  if (localIndex >= 0) return localIndex + 1;
  const view = executionView(deps, context.work.projectId, context.work.revisionId);
  const row = deps.db
    .prepare("SELECT recipe_context FROM revision_work WHERE id=?")
    .get(context.work.workId);
  if (view !== undefined && row?.recipe_context !== null && row?.recipe_context !== undefined) {
    const keys = executionPlan(deps, view, savedCatalogue(row.recipe_context)).recipes.filter(
      (recipe) =>
        recipe.stage === context.work.kind &&
        (piece.input.kind !== "llm" ||
          piece.input.preparation?.segment !== "body" ||
          (recipe.input.kind === "llm" && recipe.input.preparation?.segment === "body")) &&
        pieceKind({ ...piece, key: recipe.key, input: recipe.input }) === pieceKind(piece),
    );
    const index = keys.findIndex((recipe) => recipe.key === piece.key);
    if (index >= 0)
      return (
        index + (piece.input.kind === "llm" && piece.input.preparation?.segment === "body" ? 3 : 1)
      );
  }
  const last = piece.key.split(":").at(-1);
  return last !== undefined && /^\d+$/.test(last) ? Number(last) : 1;
}

export function retainPartialArticle(
  deps: RevisionDeps,
  context: StageContext,
  piece: WorkPiece,
  text: string,
): void {
  const publicationId = fingerprint(["partial-article", piece.id]);
  if (
    deps.db
      .prepare("SELECT 1 FROM revision_outputs WHERE revision_id=? AND publication_id=?")
      .get(context.work.revisionId, publicationId) !== undefined
  )
    return;
  const result = preparedText(deps, context, piece, "article_md", "partial-article.md", text);
  try {
    transact(deps.db, () => {
      const authority = publicationAuthority(deps.db, {
        work: context.work,
        pieceId: piece.id,
        publicationId: piece.id,
      });
      if (authority === undefined) return;
      if (authority.key !== piece.key || authority.fingerprint !== piece.fingerprint)
        throw new Error("Partial article differs from its durable piece authority.");
      const revision = revisionById(deps.db, context.work.projectId, context.work.revisionId);
      if (revision === undefined) throw new Error("Partial article origin disappeared.");
      insertAsset(deps.db, result.asset);
      insertManifestOutput(
        deps.db,
        revision,
        {
          slot: `article:partial:${piece.id}`,
          workKey: `article:partial:${piece.id}`,
          assetId: result.asset.id,
          output: { ...result.output, originalFilename: "partial-article.md" },
          fingerprint: piece.fingerprint,
          state: "outdated",
        },
        deps.ids.next(),
        publicationId,
      );
    });
  } finally {
    discardPreparedAssets(deps, [result.asset]);
  }
}
