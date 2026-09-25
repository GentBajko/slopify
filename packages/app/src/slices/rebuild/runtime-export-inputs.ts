import { readFileSync } from "node:fs";
import { z } from "zod";
import type { StageContext } from "../../kernel/runner/index.js";
import { usesNarrationPreparation, usesPronunciationGlossary } from "../admission/rules.js";
import { plainText } from "../article/plain.js";
import { splitEndMatter } from "../article/split.js";
import type { RevisionDeps, RevisionView } from "../revisions/model.js";
import type { PreparedOutput } from "../revisions/publication-model.js";
import { outputPath } from "../storage/layout.js";
import { probeDurationMs } from "../video/ffmpeg.js";
import { type AudioSegment, audioTimeline } from "../video/plan.js";
import type { RevisionWorkPlan } from "./recipe-work.js";
import type { ExportExecutionDeps } from "./runtime-export.js";
import { joinedNarration, narrationTextParts } from "./runtime-narration-text.js";
import { executionPlan, executionView, savedCatalogue } from "./runtime-plan.js";
import type { WorkPiece } from "./work-records.js";

export interface ExportSnapshot {
  readonly view: RevisionView;
  readonly plan: RevisionWorkPlan;
}
export function exportSnapshot(
  deps: RevisionDeps,
  context: StageContext,
  piece: WorkPiece,
): ExportSnapshot {
  const view = executionView(deps, context.work.projectId, context.work.revisionId);
  const row = deps.db
    .prepare("SELECT recipe_context FROM revision_work WHERE id=?")
    .get(context.work.workId);
  if (view === undefined || row === undefined)
    throw new Error("The export revision no longer exists.");
  const plan = executionPlan(deps, view, savedCatalogue(row.recipe_context));
  const recipe = plan.recipes.find(
    (one) => one.key === piece.key && one.fingerprint === piece.fingerprint,
  );
  if (recipe === undefined || recipe.deferred || recipe.unresolved)
    throw new Error("The export inputs do not match the admitted recipe.");
  return { view, plan };
}
export async function revisionAudio(
  deps: ExportExecutionDeps,
  context: StageContext,
  view: RevisionView,
): Promise<readonly AudioSegment[]> {
  const config = view.revision.config;
  if (config.sources.audio === "off") return [];
  const input = async (role: "audio_body" | "audio_intro" | "audio_outro") => {
    const row = view.outputs.find(
      (one) => one.selected && one.available && one.state === "ready" && one.output.role === role,
    );
    if (row === undefined) return undefined;
    const path = outputPath(deps.paths, context.work.projectId, row.output.path);
    const duration =
      row.output.durationMs ??
      (await (deps.measureAudio?.(path, context.signal) ??
        probeDurationMs(deps.ffmpeg, path, context.signal, deps.log)));
    if (!Number.isFinite(duration) || duration <= 0)
      throw new Error("The narration duration could not be measured.");
    return { path, seconds: duration / 1000 };
  };
  const body = await input("audio_body");
  if (body === undefined) throw new Error("The revision has no complete narration.");
  return audioTimeline(
    {
      body,
      intro:
        config.sources.audio === "generate" && config.intro !== undefined
          ? await input("audio_intro")
          : undefined,
      outro:
        config.sources.audio === "generate" && config.outro !== undefined
          ? await input("audio_outro")
          : undefined,
      gapSeconds: config.silenceGapSeconds,
    },
    config.sources.video === "off" ? 1 / 48000 : 1 / 30,
  );
}
export function revisionTranscript(
  deps: RevisionDeps,
  snapshot: ExportSnapshot,
  kind: "intro" | "body" | "outro",
): string {
  const { view, plan } = snapshot;
  if (
    usesNarrationPreparation(view.revision.config) ||
    usesPronunciationGlossary(view.revision.config)
  )
    return joinedNarration(narrationTextParts(view, plan, kind));
  const concat = plan.recipes.find(
    (one) => one.key === (kind === "body" ? "audio:body:concat" : `audio:${kind}`),
  );
  if (concat !== undefined) {
    const texts = concat.dependsOn.map((key) => {
      const row = view.pieces.find(
        (one) => one.key === key && one.selected && one.available && one.piece.state === "done",
      );
      const payload =
        row?.piece.payload === null || row?.piece.payload === undefined
          ? undefined
          : z.object({ text: z.string().optional() }).parse(JSON.parse(row.piece.payload));
      if (payload?.text !== undefined) return payload.text;
      const recipe = plan.recipes.find((one) => one.key === key);
      if (recipe?.input.kind === "tts") return recipe.input.text;
      if (
        recipe?.input.kind === "provided" &&
        Array.isArray(recipe.input.semantic) &&
        typeof recipe.input.semantic[0] === "string"
      )
        return recipe.input.semantic[0];
      throw new Error("The saved narration transcript is incomplete.");
    });
    if (texts.length > 0) return texts.join("\n");
  }
  if (kind === "body") {
    const row = view.outputs.find(
      (one) =>
        one.selected && one.available && one.state === "ready" && one.output.role === "article_txt",
    );
    if (row !== undefined)
      return readFileSync(outputPath(deps.paths, view.revision.projectId, row.output.path), "utf8");
    if (view.articleMarkdown !== null) return plainText(splitEndMatter(view.articleMarkdown).body);
  }
  throw new Error(`The saved ${kind} narration transcript is missing.`);
}
export function retainedOutput(
  deps: RevisionDeps,
  view: RevisionView,
  row: RevisionView["outputs"][number],
): PreparedOutput {
  const asset = z
    .object({
      id: z.string(),
      project_id: z.string(),
      path: z.string(),
      bytes: z.number(),
      created_at: z.string(),
    })
    .parse(
      deps.db
        .prepare("SELECT * FROM project_assets WHERE id=? AND project_id=?")
        .get(row.assetId, view.revision.projectId),
    );
  return {
    slot: row.slot,
    workKey: row.workKey,
    fingerprint: row.fingerprint,
    asset: {
      id: asset.id,
      projectId: asset.project_id,
      path: asset.path,
      bytes: asset.bytes,
      createdAt: asset.created_at,
    },
    output: { ...row.output, id: deps.ids.next(), createdAt: deps.clock.now().toISOString() },
  };
}
