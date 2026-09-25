import { readFileSync } from "node:fs";
import type { StageContext } from "../../kernel/runner/index.js";
import type { StageRunResult } from "../../kernel/runner/work.js";
import { readDocumentAssets } from "../document/fonts.js";
import { documentThemeOf } from "../document/model.js";
import { renderDocument } from "../document/render.js";
import { builtInTheme } from "../document/theme.js";
import type { RevisionView } from "../revisions/model.js";
import { writeAsset } from "../storage/assets.js";
import { outputPath } from "../storage/layout.js";
import type { OutputRole } from "../storage/model.js";
import type { LocalExecutionDeps } from "./runtime-local.js";
import { executionPlan, executionView, savedCatalogue } from "./runtime-plan.js";
import { preparedResult, publishResult } from "./runtime-publication.js";
import type { WorkPiece } from "./work-records.js";

// Lays the saved article out as a PDF. Local and quick: no provider, no charge.
export async function executeDocumentRecipe(
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
  context.signal.throwIfAborted();
  const view = documentView(deps, context, piece);
  const { projectId } = context.work;
  const text = (role: OutputRole, workKey: string): string | null => {
    const row = ready(view, role, workKey);
    return row === undefined
      ? null
      : readFileSync(outputPath(deps.paths, projectId, row.output.path), "utf8");
  };
  const config = view.revision.config;
  const article =
    view.revision.content.articleEdited === true || config.sources.article === "provide"
      ? view.articleMarkdown
      : text("article_md", "article:body");
  if (article === null)
    throw new Error(
      "The article isn't finished yet, so there's nothing to make the document from. Let the Article stage finish (Resume, or Retry stage on Article), then use Retry stage on Document.",
    );
  const thumbnail = ready(view, "thumbnail", "thumbnail:image");
  let cover: Uint8Array | null = null;
  if (config.sources.thumbnail !== "off" && thumbnail !== undefined) {
    try {
      cover = new Uint8Array(
        readFileSync(outputPath(deps.paths, projectId, thumbnail.output.path)),
      );
    } catch (error) {
      throw new Error(
        `The document's cover is the project's thumbnail, and its file can't be read (${error instanceof Error ? error.message : String(error)}). Regenerate or upload the thumbnail again (Re-run section on Thumbnail, or Edit project → Thumbnail), then use Retry stage on Document.`,
        { cause: error },
      );
    }
  }
  const rendered = renderDocument({
    title: config.title,
    articleMarkdown: article,
    researchNotes: config.sources.research === "off" ? null : text("notes", "research:notes"),
    cover,
    theme: builtInTheme(documentThemeOf(config.document)),
    writtenOn: deps.clock.now(),
    assets: readDocumentAssets(),
  });
  if (rendered.cover === "unsupported")
    deps.log.write("warn", "document.cover", {
      projectId,
      stage: "document",
      detail: "The thumbnail is not a PNG, JPEG or WebP image, so the document has no cover.",
    });
  context.signal.throwIfAborted();
  if (!context.maySubmit(piece.id)) return "held";
  const asset = writeAsset(deps, projectId, "document.pdf", rendered.bytes);
  // publishResult discards the file itself when the publication doesn't commit.
  await publishResult(
    deps,
    context,
    piece,
    [preparedResult(deps, context, piece, "document_pdf", asset)],
    { pages: rendered.pages, words: rendered.words, cover: rendered.cover },
  );
  deps.count?.("stage.completed", { stage: "document" });
  return "done";
}

function documentView(
  deps: LocalExecutionDeps,
  context: StageContext,
  piece: WorkPiece,
): RevisionView {
  const view = executionView(deps, context.work.projectId, context.work.revisionId);
  const row = deps.db
    .prepare("SELECT recipe_context FROM revision_work WHERE id=?")
    .get(context.work.workId);
  if (view === undefined || row === undefined)
    throw new Error(
      "Slopify hit an internal error (the project version the document belongs to is missing). Use Retry stage on Document; if it happens again, use Download diagnostics in Settings and report it.",
    );
  const recipe = executionPlan(deps, view, savedCatalogue(row.recipe_context)).recipes.find(
    (one) => one.key === piece.key && one.fingerprint === piece.fingerprint,
  );
  if (recipe === undefined || recipe.unresolved)
    throw new Error(
      "The project changed after this document was queued, so it no longer matches the saved article. Use Rebuild affected outputs (or Retry stage on Document) to make it from the current version.",
    );
  return view;
}

function ready(
  view: RevisionView,
  role: OutputRole,
  workKey: string,
): RevisionView["outputs"][number] | undefined {
  return view.outputs.find(
    (row) =>
      row.selected &&
      row.available &&
      row.state === "ready" &&
      row.workKey === workKey &&
      row.output.role === role,
  );
}
