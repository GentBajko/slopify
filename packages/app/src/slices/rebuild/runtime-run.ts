import type { StageContext } from "../../kernel/runner/index.js";
import type { StageProviders } from "../../kernel/runner/providers.js";
import type { StageRunResult } from "../../kernel/runner/work.js";
import { type ExportExecutionDeps, executeExportRecipe } from "./runtime-export.js";
import { executeLocalRecipe } from "./runtime-local.js";
import { executeProviderRecipe } from "./runtime-provider.js";
import { executeSubtitleRecipe } from "./runtime-subtitles.js";
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
    try {
      const outcome = piece.key.startsWith("subtitles:")
        ? await executeSubtitleRecipe(deps, context, piece)
        : piece.key.startsWith("export:")
          ? await executeExportRecipe(deps, context, piece)
          : piece.input.kind === "llm" || piece.input.kind === "tts" || piece.input.kind === "image"
            ? await executeProviderRecipe(deps, context, providers, piece)
            : await executeLocalRecipe(deps, context, piece);
      if (outcome === "held") return outcome;
    } catch (error) {
      deps.db
        .prepare(
          "UPDATE revision_work_pieces SET state=? WHERE id=? AND work_id=? AND state!='done'",
        )
        .run(context.signal.aborted ? "pending" : "failed", piece.id, context.work.workId);
      throw error;
    }
  }
  deps.db
    .prepare(
      "UPDATE revision_work_pieces SET state='done' WHERE work_id=? AND result_json IS NOT NULL",
    )
    .run(context.work.workId);
  return "done";
}
