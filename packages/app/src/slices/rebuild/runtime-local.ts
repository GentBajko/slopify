import { statSync } from "node:fs";
import { dirname, join } from "node:path";
import { z } from "zod";
import type { StageContext } from "../../kernel/runner/index.js";
import type { StageRunResult } from "../../kernel/runner/work.js";
import { plainText } from "../article/plain.js";
import { splitEndMatter } from "../article/split.js";
import { joinNarration } from "../narration/concat.js";
import type { PreparedAsset } from "../storage/assets.js";
import { allocateAsset, discardPreparedAssets, sealAsset } from "../storage/assets.js";
import { outputPath } from "../storage/layout.js";
import type { OutputRole } from "../storage/model.js";
import { publishNarrationText } from "./runtime-narration-text.js";
import { executionPlan, executionView, savedCatalogue } from "./runtime-plan.js";
import type { ProviderExecutionDeps } from "./runtime-provider.js";
import {
  preparedResult,
  preparedText,
  preparedTexts,
  publishResult,
} from "./runtime-publication.js";
import type { WorkPiece } from "./work-records.js";

export interface LocalExecutionDeps extends ProviderExecutionDeps {
  readonly ffmpeg: string;
}

export async function executeLocalRecipe(
  deps: LocalExecutionDeps,
  context: StageContext,
  piece: WorkPiece,
): Promise<StageRunResult> {
  if (
    deps.db
      .prepare("SELECT state FROM revision_work_pieces WHERE id=? AND work_id=?")
      .get(piece.id, context.work.workId)?.state === "done"
  )
    return "done";
  if (!context.maySubmit(piece.id)) return "held";
  const input = piece.input;
  if (input.kind === "provided") {
    if (input.assetId === null)
      throw new Error(
        "A file you uploaded for this project is missing. Upload it again in Edit project, then Retry stage.",
      );
    const row = z
      .object({ id: z.string(), project_id: z.string(), path: z.string(), created_at: z.string() })
      .parse(
        deps.db
          .prepare("SELECT * FROM project_assets WHERE id=? AND project_id=?")
          .get(input.assetId, context.work.projectId),
      );
    const asset: PreparedAsset = {
      id: row.id,
      projectId: row.project_id,
      path: row.path,
      createdAt: row.created_at,
      bytes: statSync(outputPath(deps.paths, row.project_id, row.path)).size,
    };
    const role: OutputRole | undefined =
      piece.key === "audio:provided"
        ? "audio_body"
        : piece.key === "thumbnail:image"
          ? "thumbnail"
          : piece.key.startsWith("image:")
            ? "image"
            : undefined;
    await publishResult(
      deps,
      context,
      piece,
      role === undefined ? [] : [preparedResult(deps, context, piece, role, asset)],
      {},
      asset,
    );
    return "done";
  }
  if (input.kind !== "local")
    throw new Error(
      "Slopify hit an internal error (a local step was set up wrongly). Retry stage; if it happens again, use Download diagnostics in Settings and report it.",
    );
  if (input.operation === "narration-files-v1") {
    await publishNarrationText(deps, context, piece);
    return "done";
  }
  if (input.operation === "concat-narration") {
    await concatenate(deps, context, piece);
    return "done";
  }
  if (input.operation === "provided-article" || input.operation === "manual-article") {
    const text = z.string().parse(input.values);
    const parts = splitEndMatter(text);
    await publishResult(
      deps,
      context,
      piece,
      preparedTexts(deps, context, piece, [
        ["article_md", "article.md", text],
        ["article_txt", "article.txt", plainText(parts.body)],
        ...(parts.sources ? [["sources", "sources.md", parts.sources] as const] : []),
        ...(parts.glossary ? [["glossary", "glossary.md", parts.glossary] as const] : []),
      ]),
      { text },
    );
    return "done";
  }
  if (input.operation === "provided-notes") {
    const text = z.string().parse(input.values);
    await publishResult(
      deps,
      context,
      piece,
      [preparedText(deps, context, piece, "notes", "notes.md", text)],
      { text },
    );
    return "done";
  }
  if (input.operation === "entry-text") {
    await publishResult(deps, context, piece, [], {
      text: z.string().parse(input.values),
      category: piece.key.includes(":intro:") ? "intro" : "outro",
    });
    return "done";
  }
  throw new Error(
    `Slopify hit an internal error (no handler for the step "${input.operation}"). Retry stage; if it happens again, use Download diagnostics in Settings and report it.`,
  );
}

async function concatenate(
  deps: LocalExecutionDeps,
  context: StageContext,
  piece: WorkPiece,
): Promise<void> {
  const view = executionView(deps, context.work.projectId, context.work.revisionId);
  if (view === undefined)
    throw new Error(
      "Slopify hit an internal error (the project version being built is missing). Retry stage; if it happens again, use Download diagnostics in Settings and report it.",
    );
  const row = deps.db
    .prepare("SELECT recipe_context FROM revision_work WHERE id=?")
    .get(context.work.workId);
  const plan = executionPlan(deps, view, savedCatalogue(row?.recipe_context));
  const recipe = plan.recipes.find(
    (candidate) => candidate.key === piece.key && candidate.fingerprint === piece.fingerprint,
  );
  if (recipe === undefined)
    throw new Error(
      "Slopify hit an internal error (the narration chunks to join no longer match the project's saved inputs). Retry stage; if it happens again, use Download diagnostics in Settings and report it.",
    );
  const files = recipe.dependsOn.map((key) => {
    const input = view.pieces.find(
      (candidate) =>
        candidate.key === key &&
        candidate.selected &&
        candidate.available &&
        candidate.piece.state === "done" &&
        candidate.fingerprint === plan.recipes.find((value) => value.key === key)?.fingerprint,
    );
    if (input?.assetId === null || input === undefined)
      throw new Error(
        "One narration chunk has no saved audio, so the narration can't be joined together. Regenerate the missing chunk in Edit project → Narration, then Retry stage.",
      );
    const asset = deps.db
      .prepare("SELECT path FROM project_assets WHERE id=? AND project_id=?")
      .get(input.assetId, context.work.projectId);
    return outputPath(deps.paths, context.work.projectId, z.string().parse(asset?.path));
  });
  const pending = allocateAsset(deps, context.work.projectId, "narration.mp3");
  try {
    const durationMs = await joinNarration(
      { bin: deps.ffmpeg, log: deps.log },
      {
        files,
        output: pending.absolutePath,
        listPath: join(dirname(pending.absolutePath), "parts.txt"),
        signal: context.signal,
      },
    );
    context.signal.throwIfAborted();
    const asset = sealAsset(deps, pending);
    const role =
      piece.key === "audio:intro"
        ? "audio_intro"
        : piece.key === "audio:outro"
          ? "audio_outro"
          : "audio_body";
    await publishResult(
      deps,
      context,
      piece,
      [
        preparedResult(
          deps,
          context,
          piece,
          role,
          asset,
          durationMs,
          view.revision.config.audio === undefined
            ? {}
            : {
                provider: view.revision.config.audio.provider,
                model: view.revision.config.audio.model,
                voice: view.revision.config.audio.voice,
              },
        ),
      ],
      { durationMs },
      asset,
    );
    for (const key of recipe.dependsOn) {
      const retained = view.pieces.find(
        (candidate) => candidate.key === key && candidate.selected && candidate.available,
      );
      if (retained?.publicationId === null || retained === undefined) continue;
      const owner = deps.db
        .prepare("SELECT work_id FROM revision_work_pieces WHERE id=?")
        .get(retained.publicationId);
      if (typeof owner?.work_id === "string")
        deps.audioPreviews?.clear(context.work.projectId, owner.work_id);
    }
  } finally {
    discardPreparedAssets(deps, [pending]);
  }
}
