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
