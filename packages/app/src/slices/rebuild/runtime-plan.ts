import { readFileSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import type { Catalogue } from "../../catalog/schema.js";
import { catalogueSchema } from "../../catalog/schema.js";
import type { ThinkingMode } from "../../kernel/ports/llm.js";
import type { LlmCall } from "../../kernel/runner/providers.js";
import { fingerprint } from "../../kernel/runner/work.js";
import type { RunConfig } from "../admission/model.js";
import type { ManifestPiece, RevisionDeps, RevisionView } from "../revisions/model.js";
import { getRevisionView, readyOutput, withEarlierJoins } from "../revisions/view.js";
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

function savedContext(db: DatabaseSync, workId: string): unknown {
  return db.prepare("SELECT recipe_context FROM revision_work WHERE id=?").get(workId)
    ?.recipe_context;
}

// The catalogue a work was admitted with, saved beside it; a work without one is a bug.
export function workCatalogue(db: DatabaseSync, workId: string): Catalogue {
  return savedCatalogue(savedContext(db, workId));
}

// The same, or undefined for a work (or a missing one) that has no catalogue saved.
export function workCatalogueIfSaved(db: DatabaseSync, workId: string): Catalogue | undefined {
  const context = savedContext(db, workId);
  return context === null || context === undefined ? undefined : savedCatalogue(context);
}

export interface WorkLlmChoice {
  readonly provider: string;
  readonly model: string;
  readonly thinking?: ThinkingMode | undefined;
}

// A step's LLM call on its work's saved catalogue: the chosen model with the thinking settings
// the catalogue holds for its level, no web search, labelled with the step. The catalogue is
// read once, as the builder is made.
export function workLlm(
  db: DatabaseSync,
  workId: string,
  choice: WorkLlmChoice,
  label: string,
): (call: Omit<LlmCall, "provider" | "model" | "thinking" | "thinkingConfig">) => LlmCall {
  const catalogued = workCatalogue(db, workId).llm.find(
    (one) => one.provider === choice.provider && one.id === choice.model,
  );
  const { thinking } = choice;
  return (call) => ({
    provider: choice.provider,
    model: choice.model,
    ...(thinking === undefined ? {} : { thinking }),
    thinkingConfig: thinking === undefined ? null : (catalogued?.llm.thinking?.[thinking] ?? null),
    webSearch: false,
    previewLabel: label,
    ...call,
  });
}

// Ten places ask for the plan, and each one used to derive it from scratch: the article read
// back off disk, every recipe rebuilt from the narration up. At twelve images that happened a
// few dozen times over a run; at 240 it happened tens of thousands of times and the server
// spent its whole time planning instead of answering.
//
// The plan is kept and handed back while nothing in the database has changed, which SQLite
// counts for us. That is a blunt test on purpose: a write anywhere - another project, another
// revision - throws the plan away and it is derived again. It can never hand back a plan from
// after a write it has not seen, which is the only direction that would matter, because a
// stale plan would start the wrong work.
// Per database, never shared between them: two of them (the app and a mirror, or two tests)
// can hold the same project under the same id, and one's plan is not the other's.
const kept = new WeakMap<
  DatabaseSync,
  Map<string, { readonly changes: number; readonly plan: RevisionWorkPlan }>
>();
const changeCount = z.object({ changes: z.number() });

function writesSoFar(deps: RevisionDeps): number {
  return changeCount.parse(deps.db.prepare("SELECT total_changes() AS changes").get()).changes;
}

// Two catalogues that differ give different plans, so the catalogue belongs in the key. Its
// date and shape identify it without hashing the whole of it on every call.
function catalogueMark(catalogue: Catalogue): string {
  return [
    catalogue.schemaVersion,
    catalogue.updatedAt,
    catalogue.llm.length,
    catalogue.image?.length ?? 0,
    Object.keys(catalogue.providers).length,
  ].join("/");
}

// What the plan was derived from, beyond the database: whether each output and piece is
// selected and whether its file is still on disk. A file deleted by hand is no write at all,
// so `total_changes()` would never notice it, and the plan would go on reusing work whose
// output is gone. Walking a few hundred rows is nothing beside deriving the plan again.
function viewMark(view: RevisionView): string {
  const rows: string[] = [String(view.articleMarkdown?.length ?? -1)];
  for (const row of view.outputs)
    rows.push(
      `o${row.recordId}:${row.selected ? 1 : 0}${row.available ? 1 : 0}:${row.fingerprint}`,
    );
  for (const row of view.pieces)
    rows.push(
      `p${row.recordId}:${row.selected ? 1 : 0}${row.available ? 1 : 0}:${row.fingerprint}`,
    );
  return fingerprint(rows.join("\n"));
}

export function executionPlan(
  deps: RevisionDeps,
  view: RevisionView,
  catalogue: Catalogue,
): RevisionWorkPlan {
  const key = `${view.revision.projectId}/${view.revision.id}/${catalogueMark(catalogue)}/${viewMark(view)}`;
  const changes = writesSoFar(deps);
  const forDb = kept.get(deps.db) ?? new Map();
  kept.set(deps.db, forDb);
  const held = forDb.get(key);
  if (held !== undefined && held.changes === changes) return held.plan;
  const plan = derivePlan(deps, view, catalogue);
  // A cache, not a store: a handful of revisions is all a run needs at once.
  if (forDb.size > 8) forDb.clear();
  forDb.set(key, { changes, plan });
  return plan;
}

function derivePlan(
  deps: RevisionDeps,
  view: RevisionView,
  catalogue: Catalogue,
): RevisionWorkPlan {
  const textOutput = (role: "article_md" | "notes"): string | null => {
    const row = readyOutput(view, { role });
    return row === undefined
      ? null
      : readFileSync(outputPath(deps.paths, view.revision.projectId, row.output.path), "utf8");
  };
  const payloads = view.pieces.filter(
    (piece) => piece.selected && piece.piece.state === "done" && piece.piece.payload !== null,
  );
  const resolved = {
    articleMarkdown:
      view.revision.content.articleEdited === true ||
      view.revision.config.sources.article !== "generate"
        ? view.articleMarkdown
        : textOutput("article_md"),
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
      withEarlierJoins(deps, view),
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
