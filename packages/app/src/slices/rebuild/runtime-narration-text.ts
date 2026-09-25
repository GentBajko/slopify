import { z } from "zod";
import type { StageContext } from "../../kernel/runner/index.js";
import type { NarrationSegment } from "../narration/preparation.js";
import type { RevisionDeps, RevisionView } from "../revisions/model.js";
import type { RevisionWorkPlan } from "./recipe-work.js";
import { executionPlan, executionView, savedCatalogue } from "./runtime-plan.js";
import { preparedTexts, publishResult } from "./runtime-publication.js";
import type { WorkPiece } from "./work-records.js";

export interface NarrationTextPart {
  readonly logicalKey: string;
  readonly spokenText: string;
  readonly requestText: string | null;
}

export function joinedNarration(parts: readonly NarrationTextPart[]): string {
  return parts
    .map(
      (part, index) =>
        `${index > 0 && parts[index - 1]?.logicalKey !== part.logicalKey ? "\n" : ""}${part.spokenText}`,
    )
    .join("");
}

export function narrationTextParts(
  view: RevisionView,
  plan: RevisionWorkPlan,
  segment: NarrationSegment,
): readonly NarrationTextPart[] {
  const concat = plan.recipes.find(
    (row) => row.key === (segment === "body" ? "audio:body:concat" : `audio:${segment}`),
  );
  if (concat === undefined) throw new Error(`The saved ${segment} narration is missing.`);
  return concat.dependsOn.map((key) => {
    const recipe = plan.recipes.find((row) => row.key === key);
    const selected = view.pieces.find(
      (row) =>
        row.key === key &&
        row.selected &&
        row.available &&
        row.piece.state === "done" &&
        row.fingerprint === recipe?.fingerprint,
    );
    if (selected === undefined || recipe === undefined)
      throw new Error("The saved narration transcript is incomplete.");
    const input = recipe.input;
    if (
      input.kind === "provided" &&
      Array.isArray(input.semantic) &&
      typeof input.semantic[0] === "string"
    )
      return {
        logicalKey: key.slice(0, key.lastIndexOf(":")),
        spokenText: input.semantic[0],
        requestText: null,
      };
    if (input.kind !== "tts") throw new Error("The narration source has not resolved.");
    const payload = z
      .object({ text: z.string().optional(), spokenText: z.string().optional() })
      .parse(JSON.parse(selected.piece.payload ?? "{}"));
    if (
      input.spokenText !== undefined &&
      (payload.spokenText !== input.spokenText || payload.text !== input.text)
    )
      throw new Error("Prepared narration is missing its exact clean transcript.");
    return {
      logicalKey: input.logicalKey,
      spokenText:
        input.spokenText === undefined ? (payload.text ?? input.text) : (payload.spokenText ?? ""),
      requestText: input.text,
    };
  });
}

export async function publishNarrationText(
  deps: RevisionDeps,
  context: StageContext,
  piece: WorkPiece,
): Promise<void> {
  if (piece.input.kind !== "local") throw new Error("Expected a narration-file recipe.");
  const { segment } = z
    .object({ segment: z.enum(["body", "intro", "outro"]) })
    .parse(piece.input.values);
  const view = executionView(deps, context.work.projectId, context.work.revisionId);
  const row = deps.db
    .prepare("SELECT recipe_context FROM revision_work WHERE id=?")
    .get(context.work.workId);
  if (view === undefined) throw new Error("The pinned narration revision is missing.");
  const plan = executionPlan(deps, view, savedCatalogue(row?.recipe_context));
  if (
    !plan.recipes.some(
      (recipe) => recipe.key === piece.key && recipe.fingerprint === piece.fingerprint,
    )
  )
    throw new Error("Narration text no longer matches the admitted inputs.");
  const parts = narrationTextParts(view, plan, segment);
  const outputs = preparedTexts(deps, context, piece, [
    ["narration_txt", `${segment}-narration.txt`, joinedNarration(parts)],
    [
      "tts_script",
      `${segment}-tts-script.txt`,
      parts.flatMap((part) => (part.requestText === null ? [] : [part.requestText])).join("\n\n"),
    ],
  ]).map((output) => ({
    ...output,
    slot: `${piece.key}:${output.output.role}`,
    output: { ...output.output, meta: { ...output.output.meta, segment } },
  }));
  await publishResult(deps, context, piece, outputs, { segment });
}

export interface NarrationChunk {
  readonly key: string;
  readonly spokenText: string;
}

// The narration's chunks in the order they are spoken, each with its clean text. A chunk is
// sent as one or more parts; the Narration editor numbers these chunks, so anything that
// names "chunk N" to a person counts from this list.
export function narrationChunks(parts: readonly NarrationTextPart[]): readonly NarrationChunk[] {
  const chunks: NarrationChunk[] = [];
  for (const part of parts) {
    const last = chunks.at(-1);
    if (last?.key === part.logicalKey)
      chunks[chunks.length - 1] = {
        key: last.key,
        spokenText: `${last.spokenText}${part.spokenText}`,
      };
    else chunks.push({ key: part.logicalKey, spokenText: part.spokenText });
  }
  return chunks;
}

// The current chunk keys of each narration segment, in spoken order, for the Narration
// editor. Undefined when the revision has no admitted work to read a plan from, or its
// narration is not complete yet; the editor then keeps its own listing.
export function narrationChunkOrder(
  deps: RevisionDeps,
  projectId: string,
  revisionId: string,
): Readonly<Partial<Record<NarrationSegment, readonly string[]>>> | undefined {
  const row = deps.db
    .prepare(
      "SELECT recipe_context FROM revision_work WHERE project_id=? AND revision_id=? AND recipe_context IS NOT NULL LIMIT 1",
    )
    .get(projectId, revisionId);
  const view = executionView(deps, projectId, revisionId);
  if (row === undefined || view === undefined) return undefined;
  const plan = executionPlan(deps, view, savedCatalogue(row.recipe_context));
  const order: Partial<Record<NarrationSegment, readonly string[]>> = {};
  for (const segment of ["intro", "body", "outro"] as const) {
    try {
      order[segment] = narrationChunks(narrationTextParts(view, plan, segment)).map(
        (chunk) => chunk.key,
      );
    } catch {
      // A segment that is off, or not narrated yet, has no chunks to order.
    }
  }
  return order;
}
