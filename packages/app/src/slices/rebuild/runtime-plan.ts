import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import type { Catalogue } from "../../catalog/schema.js";
import { catalogueSchema } from "../../catalog/schema.js";
import type { ThinkingMode } from "../../kernel/ports/llm.js";
import type { LlmCall } from "../../kernel/runner/providers.js";
import type { RunConfig } from "../admission/model.js";
import {
  narrationJoinPiecesOfProject,
  narrationJoinsOfProject,
} from "../revisions/manifest-repo.js";
import type {
  ManifestPiece,
  RevisionDeps,
  RevisionOutputRecord,
  RevisionPieceRecord,
  RevisionView,
} from "../revisions/model.js";
import { getRevisionView, readyOutput } from "../revisions/view.js";
import { outputPath } from "../storage/layout.js";
import {
  forgetNarrationHistory,
  referencedAssetsAvailable,
  retainedNarrationHistory,
} from "./narration-history.js";
import { applyReviews, type ProvidedReview, providedReviews } from "./provided-review.js";
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
// The plan is kept and handed back while everything it is derived from is unchanged. It used
// to be thrown away on any write to the database at all, which during a run is every finished
// step of every project, and every write a step makes on its way (its attempt, its cost, its
// telemetry): a dozen runs at once derived the plan of a 2-hour video several times a second
// and the server stopped answering. Now the key is what the plan reads, each part read afresh
// on every call (`planInputs`): the version, its outputs and pieces and whether each file is on
// disk, the article and notes it reads off disk, the project's narration history and narration
// joins, the uploads it refers to, its saved provided-content reviews and the catalogue. What
// those were read from changes, the key changes. A stale plan would start the wrong work, so a
// test (`runtime-plan-inputs.test.ts`) lists every table a derivation reads: one read the key
// doesn't cover fails it.
// Per database, never shared between them: two of them (the app and a mirror, or two tests)
// can hold the same project under the same id, and one's plan is not the other's.
const kept = new WeakMap<DatabaseSync, Map<string, RevisionWorkPlan>>();
const keptPlans = 48;

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

const hash = (text: string): string => createHash("sha256").update(text).digest("base64url");

// What the plan reads of the version: its settings and contents, whether each output and
// piece is selected and whether its file is still on disk. A file deleted by hand is no write at
// all, and the plan must stop reusing work whose output is gone. A saved output or piece never
// changes under its record id (only which are selected does), so the id stands for its record.
function viewMark(view: RevisionView): string {
  const rows: string[] = [
    JSON.stringify(view.revision),
    String(view.current),
    view.articleMarkdown === null ? "-" : `+${view.articleMarkdown}`,
  ];
  for (const row of view.outputs)
    rows.push(
      `o${row.recordId}:${row.selected ? 1 : 0}${row.available ? 1 : 0}:${row.fingerprint}`,
    );
  for (const row of view.pieces)
    rows.push(
      `p${row.recordId}:${row.selected ? 1 : 0}${row.available ? 1 : 0}:${row.fingerprint}`,
    );
  return hash(rows.join("\n"));
}

// Everything a derivation reads beyond the view, read once per call: for the key, and then,
// when the plan isn't kept, for the derivation itself.
interface PlanInputs {
  readonly articleMarkdown: string | null;
  readonly researchNotes: string | null;
  readonly history: ReturnType<typeof retainedNarrationHistory>;
  readonly referenced: readonly string[];
  readonly earlierJoins: readonly RevisionOutputRecord[];
  readonly earlierJoinPieces: readonly RevisionPieceRecord[];
  readonly reviews: readonly ProvidedReview[];
}

function planInputs(deps: RevisionDeps, view: RevisionView): PlanInputs {
  const textOutput = (role: "article_md" | "notes"): string | null => {
    const row = readyOutput(view, { role });
    return row === undefined
      ? null
      : readFileSync(outputPath(deps.paths, view.revision.projectId, row.output.path), "utf8");
  };
  const { projectId } = view.revision;
  return {
    articleMarkdown:
      view.revision.content.articleEdited === true ||
      view.revision.config.sources.article !== "generate"
        ? view.articleMarkdown
        : textOutput("article_md"),
    researchNotes: textOutput("notes"),
    history: retainedNarrationHistory(deps, projectId),
    referenced: referencedAssetsAvailable(
      deps,
      projectId,
      Object.values(view.revision.content.narrationOverrides).flatMap((value) =>
        value.kind === "asset" ? [value.assetId] : [],
      ),
    ),
    earlierJoins: narrationJoinsOfProject(deps.db, projectId),
    earlierJoinPieces: narrationJoinPiecesOfProject(deps.db, projectId),
    reviews: providedReviews(deps.db, view.revision.id),
  };
}

function inputsMark(inputs: PlanInputs): string {
  const record = (row: {
    readonly recordId: string;
    readonly selected: boolean;
    readonly fingerprint: string;
    readonly assetId: string | null;
  }) => `${row.recordId}:${row.selected ? 1 : 0}:${row.fingerprint}:${row.assetId}`;
  return hash(
    [
      inputs.articleMarkdown === null ? "-" : `+${inputs.articleMarkdown}`,
      inputs.researchNotes === null ? "-" : `+${inputs.researchNotes}`,
      inputs.history.mark,
      inputs.referenced.join(","),
      inputs.earlierJoins.map((row) => `${record(row)}:${row.state}`).join(","),
      inputs.earlierJoinPieces.map(record).join(","),
      JSON.stringify(inputs.reviews),
    ].join("\n\u0000"),
  );
}

// Forgets the plans and planning inputs kept for this database, so the next plan is derived
// from fresh reads (tests compare the two).
export function forgetPlanInputs(db: DatabaseSync): void {
  kept.delete(db);
  forgetNarrationHistory(db);
}

export function executionPlan(
  deps: RevisionDeps,
  view: RevisionView,
  catalogue: Catalogue,
): RevisionWorkPlan {
  const inputs = planInputs(deps, view);
  const key = `${view.revision.projectId}/${view.revision.id}/${catalogueMark(catalogue)}/${viewMark(view)}/${inputsMark(inputs)}`;
  const forDb = kept.get(deps.db) ?? new Map<string, RevisionWorkPlan>();
  kept.set(deps.db, forDb);
  const held = forDb.get(key);
  if (held !== undefined) {
    forDb.delete(key);
    forDb.set(key, held);
    return held;
  }
  const plan = derivePlan(view, catalogue, inputs);
  // A cache, not a store, and the least recently used goes first: a dozen runs at once, each
  // with the versions its held work came from (a redo plans those too). Clearing it all past
  // nine threw every project's plan away before that project asked again.
  forDb.set(key, plan);
  if (forDb.size > keptPlans) forDb.delete(forDb.keys().next().value as string);
  return plan;
}

function derivePlan(
  view: RevisionView,
  catalogue: Catalogue,
  inputs: PlanInputs,
): RevisionWorkPlan {
  const payloads = view.pieces.filter(
    (piece) => piece.selected && piece.piece.state === "done" && piece.piece.payload !== null,
  );
  const resolved = {
    articleMarkdown: inputs.articleMarkdown,
    researchNotes: inputs.researchNotes,
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
  const history = inputs.history.pieces;
  const available = new Set([
    ...history
      .filter((row) => row.available && row.assetId !== null)
      .flatMap((row) => (row.assetId === null ? [] : [row.assetId])),
    ...inputs.referenced,
    ...view.outputs.filter((row) => row.available).map((row) => row.assetId),
    ...view.pieces
      .filter((row) => row.available && row.assetId !== null)
      .flatMap((row) => (row.assetId === null ? [] : [row.assetId])),
  ]);
  return applyReviews(
    inputs.reviews,
    planRevisionWork(
      view.revision,
      // The view with the narration joins of every version of the project (`withEarlierJoins`).
      { ...view, earlierJoins: inputs.earlierJoins, earlierJoinPieces: inputs.earlierJoinPieces },
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
