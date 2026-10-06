import type { StageContext } from "../../kernel/runner/index.js";
import type { StageProviders } from "../../kernel/runner/providers.js";
import type { StageRunResult } from "../../kernel/runner/work.js";
import { executeAnimateRecipe } from "./runtime-animate.js";
import { executeDocumentRecipe } from "./runtime-document.js";
import { type ExportExecutionDeps, executeExportRecipe } from "./runtime-export.js";
import { executeLocalRecipe } from "./runtime-local.js";
import { pieceLabel } from "./runtime-piece-label.js";
import { executeProviderRecipe } from "./runtime-provider.js";
import { executeReviewRecipe } from "./runtime-review.js";
import { executeShortsRecipe } from "./runtime-shorts.js";
import { executeSubtitleRecipe } from "./runtime-subtitles.js";
import { executeVoicesRecipe } from "./runtime-voices.js";
import { executeYoutubeRecipe } from "./runtime-youtube.js";
import { workPieces } from "./work-records.js";

export async function runRevisionInvocation(
  deps: ExportExecutionDeps,
  context: StageContext,
  providers: StageProviders,
): Promise<StageRunResult> {
  const pieces = workPieces(deps.db, context.work.workId).filter(
    (piece) => !piece.key.startsWith("article:continuation:"),
  );
  for (const piece of pieces) {
    if (piece.state === "done") continue;
    if (piece.input.kind === "deferred") return "held";
    // A step Slopify does itself (no provider call) records how long it ran, for the working
    // time; a provider call records its own attempts.
    const local =
      /^(subtitles|export|document|voices):/.test(piece.key) ||
      /^shorts:\d+:render$/.test(piece.key) ||
      (!/^(review|youtube|shorts|animate):/.test(piece.key) &&
        piece.input.kind !== "llm" &&
        piece.input.kind !== "tts" &&
        piece.input.kind !== "image");
    const timed = local ? startLocalTime(deps, context) : undefined;
    try {
      const outcome = piece.key.startsWith("subtitles:")
        ? await executeSubtitleRecipe(deps, context, piece)
        : piece.key.startsWith("export:")
          ? await executeExportRecipe(deps, context, piece)
          : piece.key.startsWith("document:")
            ? await executeDocumentRecipe(deps, context, piece)
            : piece.key.startsWith("review:")
              ? await executeReviewRecipe(deps, context, providers, piece)
              : piece.key.startsWith("voices:")
                ? await executeVoicesRecipe(deps, context, piece)
                : piece.key.startsWith("youtube:")
                  ? await executeYoutubeRecipe(deps, context, providers, piece)
                  : piece.key.startsWith("shorts:")
                    ? await executeShortsRecipe(deps, context, providers, piece)
                    : piece.key.startsWith("animate:")
                      ? await executeAnimateRecipe(deps, context, providers, piece)
                      : piece.input.kind === "llm" ||
                          piece.input.kind === "tts" ||
                          piece.input.kind === "image"
                        ? await executeProviderRecipe(deps, context, providers, piece)
                        : await executeLocalRecipe(deps, context, piece);
      if (outcome === "held") return outcome;
    } catch (error) {
      deps.db
        .prepare(
          "UPDATE revision_work_pieces SET state=? WHERE id=? AND work_id=? AND state!='done'",
        )
        .run(context.signal.aborted ? "pending" : "failed", piece.id, context.work.workId);
      if (context.signal.aborted || !(error instanceof Error)) throw error;
      let label: string | undefined;
      try {
        label = pieceLabel(deps, context, piece);
      } catch {
        // The error itself matters more than its label.
      }
      throw label === undefined ? error : new Error(`${label}: ${error.message}`, { cause: error });
    } finally {
      if (timed !== undefined) endLocalTime(deps, timed);
    }
  }
  deps.db
    .prepare(
      "UPDATE revision_work_pieces SET state='done' WHERE work_id=? AND result_json IS NOT NULL",
    )
    .run(context.work.workId);
  return "done";
}

function startLocalTime(deps: ExportExecutionDeps, context: StageContext): string {
  const id = deps.ids.next();
  deps.db
    .prepare(
      "INSERT INTO local_work_times(id,project_id,stage_id,revision_id,work_id,started_at) VALUES (?,?,?,?,?,?)",
    )
    .run(
      id,
      context.work.projectId,
      context.work.stageId,
      context.work.revisionId,
      context.work.workId,
      deps.clock.now().toISOString(),
    );
  return id;
}

function endLocalTime(deps: ExportExecutionDeps, id: string): void {
  deps.db
    .prepare("UPDATE local_work_times SET ended_at=? WHERE id=?")
    .run(deps.clock.now().toISOString(), id);
}
