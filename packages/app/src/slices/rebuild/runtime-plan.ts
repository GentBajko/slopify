import { readFileSync } from "node:fs";
import { z } from "zod";
import type { Catalogue } from "../../catalog/schema.js";
import { catalogueSchema } from "../../catalog/schema.js";
import type { RunConfig } from "../admission/model.js";
import type { ManifestPiece, RevisionDeps, RevisionView } from "../revisions/model.js";
import { getRevisionView } from "../revisions/view.js";
import { outputPath } from "../storage/layout.js";
import { referencedAssetsAvailable, retainedNarrationPieces } from "./narration-history.js";
import { applyProvidedReviews } from "./provided-review.js";
import type { RecipeContext, ResolvedRevisionInputs } from "./recipe-model.js";
import { textRecipes } from "./recipe-text.js";
import { planRevisionWork, type RevisionWorkPlan } from "./recipe-work.js";

export function executionCatalogue(catalogue: Catalogue, config: RunConfig): Catalogue {
  const choices = [config.llm, config.audio, config.images];
  const uses = (model: { readonly provider: string; readonly id: string }): boolean =>
    choices.some((choice) => choice?.provider === model.provider && choice.model === model.id);
  const providerIds = new Set(choices.flatMap((choice) => (choice ? [choice.provider] : [])));
  return {
    ...catalogue,
    providers: Object.fromEntries(
      Object.entries(catalogue.providers).filter(([id]) => providerIds.has(id)),
    ),
    llm: catalogue.llm.filter(uses),
    tts: catalogue.tts.filter(uses),
    image: catalogue.image.filter(uses),
  };
}

export function savedCatalogue(value: unknown): Catalogue {
  return catalogueSchema.parse(JSON.parse(z.string().parse(value)));
}

export function executionPlan(
  deps: RevisionDeps,
  view: RevisionView,
  catalogue: Catalogue,
): RevisionWorkPlan {
  const textOutput = (role: "article_md" | "notes"): string | null => {
    const row = view.outputs.find(
      (output) => output.selected && output.available && output.output.role === role,
    );
    return row === undefined
      ? null
      : readFileSync(outputPath(deps.paths, view.revision.projectId, row.output.path), "utf8");
  };
  const payloads = view.pieces.filter(
    (piece) => piece.selected && piece.piece.state === "done" && piece.piece.payload !== null,
  );
  const resolved = {
    articleMarkdown: view.articleMarkdown ?? textOutput("article_md"),
    researchNotes: textOutput("notes"),
  };
  const research = matchingResearch(
    {
      config: view.revision.config,
      content: view.revision.content,
      manifest: view,
      catalogue,
      resolved,
    },
    payloads,
  );
  const history = retainedNarrationPieces(deps, view.revision.projectId);
  const available = new Set([
    ...history
      .filter((row) => row.available && row.assetId !== null)
      .flatMap((row) => (row.assetId === null ? [] : [row.assetId])),
    ...referencedAssetsAvailable(
      deps,
      view.revision.projectId,
      Object.values(view.revision.content.narrationOverrides).flatMap((value) =>
        value.kind === "asset" ? [value.assetId] : [],
      ),
    ),
    ...view.outputs.filter((row) => row.available).map((row) => row.assetId),
    ...view.pieces
      .filter((row) => row.available && row.assetId !== null)
      .flatMap((row) => (row.assetId === null ? [] : [row.assetId])),
  ]);
  return applyProvidedReviews(
    deps.db,
    view.revision.id,
    planRevisionWork(
      view.revision,
      view,
      catalogue,
      available,
      {
        ...resolved,
        ...(research === undefined ? {} : { research }),
      },
      history,
    ),
  );
}

export function executionView(
  deps: RevisionDeps,
  projectId: string,
  revisionId: string,
): RevisionView | undefined {
  const view = getRevisionView(deps, projectId, revisionId);
  if (view === undefined) return undefined;
  const carried = new Set(
    deps.db
      .prepare(
        "SELECT r.piece_id FROM revision_work_reservations r JOIN project_heads h ON h.revision_id=r.revision_id AND h.project_id=r.project_id JOIN revision_work w ON w.id=r.work_id WHERE r.project_id=? AND w.revision_id=?",
      )
      .all(projectId, revisionId)
      .map((row) => row.piece_id),
  );
  return {
    ...view,
    outputs: view.outputs.map((row) => ({
      ...row,
      selected: row.selected || (row.publicationId !== null && carried.has(row.publicationId)),
    })),
    pieces: view.pieces.map((row) => ({
      ...row,
      selected: row.selected || (row.publicationId !== null && carried.has(row.publicationId)),
    })),
  };
}

function matchingResearch(
  context: RecipeContext,
  payloads: readonly ManifestPiece[],
): ResolvedRevisionInputs["research"] {
  const planner = textRecipes(context).recipes.find((row) => row.key === "research:planner");
  if (planner === undefined) return undefined;
  const savedPlanner = payloads.find(
    (row) => row.key === planner.key && row.fingerprint === planner.fingerprint,
  );
  if (savedPlanner?.piece.payload === undefined || savedPlanner.piece.payload === null)
    return undefined;
  const { outline } = z
    .object({ outline: z.array(z.string()) })
    .parse(JSON.parse(savedPlanner.piece.payload));
  const chapters = textRecipes({
    ...context,
    resolved: { ...context.resolved, research: { outline, findings: [] } },
  }).recipes.filter((row) => row.key.startsWith("research:chapter:"));
  const findings = chapters.flatMap((chapter) => {
    const saved = payloads.find(
      (row) => row.key === chapter.key && row.fingerprint === chapter.fingerprint,
    );
    if (saved?.piece.payload === undefined || saved.piece.payload === null) return [];
    return [
      z.object({ title: z.string(), notes: z.string() }).parse(JSON.parse(saved.piece.payload)),
    ];
  });
  return { outline, findings };
}
