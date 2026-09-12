import { readFileSync } from "node:fs";
import { z } from "zod";
import type { Catalogue } from "../../catalog/schema.js";
import { catalogueSchema } from "../../catalog/schema.js";
import type { RunConfig } from "../admission/model.js";
import type { RevisionDeps, RevisionView } from "../revisions/model.js";
import { getRevisionView } from "../revisions/view.js";
import { outputPath } from "../storage/layout.js";
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
  const planner = payloads.find((piece) => piece.key === "research:planner");
  const outline =
    planner?.piece.payload === undefined || planner.piece.payload === null
      ? []
      : z.object({ outline: z.array(z.string()) }).parse(JSON.parse(planner.piece.payload)).outline;
  const findings = payloads
    .filter((piece) => piece.key.startsWith("research:chapter:"))
    .map((piece) =>
      z
        .object({ title: z.string(), notes: z.string() })
        .parse(JSON.parse(piece.piece.payload ?? "{}")),
    );
  const available = new Set([
    ...view.outputs.filter((row) => row.available).map((row) => row.assetId),
    ...view.pieces
      .filter((row) => row.available && row.assetId !== null)
      .flatMap((row) => (row.assetId === null ? [] : [row.assetId])),
  ]);
  return planRevisionWork(view.revision, view, catalogue, available, {
    articleMarkdown: view.articleMarkdown ?? textOutput("article_md"),
    researchNotes: textOutput("notes"),
    ...(outline.length === 0 ? {} : { research: { outline, findings } }),
  });
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
