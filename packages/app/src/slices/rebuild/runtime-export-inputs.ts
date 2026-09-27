import { readFileSync } from "node:fs";
import { z } from "zod";
import type { StageContext } from "../../kernel/runner/index.js";
import {
  narrationAliasesOf,
  usesNarrationPreparation,
  usesPronunciationGlossary,
} from "../admission/rules.js";
import { plainText } from "../article/plain.js";
import { splitEndMatter } from "../article/split.js";
import { usesLoudness } from "../loudness/model.js";
import type { RevisionDeps, RevisionView } from "../revisions/model.js";
import type { PreparedOutput } from "../revisions/publication-model.js";
import { outputPath } from "../storage/layout.js";
import { probeDurationMs } from "../video/ffmpeg.js";
import { type AudioSegment, audioTimeline } from "../video/plan.js";
import { usesVoices } from "../voices/model.js";
import type { SpokenTurn } from "../voices/timing.js";
import { levelKey } from "./recipe-loudness.js";
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
    throw new Error(
      "Slopify hit an internal error (the project version being exported is missing). Try again; if it happens again, use Download diagnostics in Settings and report it.",
    );
  const plan = executionPlan(deps, view, savedCatalogue(row.recipe_context));
  const recipe = plan.recipes.find(
    (one) => one.key === piece.key && one.fingerprint === piece.fingerprint,
  );
  if (recipe === undefined || recipe.deferred || recipe.unresolved)
    throw new Error(
      "Slopify hit an internal error (the export no longer matches the project's saved inputs). Try again; if it happens again, use Download diagnostics in Settings and report it.",
    );
  return { view, plan };
}
export async function revisionAudio(
  deps: ExportExecutionDeps,
  context: StageContext,
  view: RevisionView,
  // Level the volume: what plays the sound (the video, a short, the audio files) asks for the
  // levelled joins (`recipe-loudness.ts`); what only times it (the word timing, the description,
  // the shorts' pick) reads the plain ones, which it waits for. An uploaded narration has no
  // levelled join: only the master reaches it.
  options: { readonly levelled?: boolean } = {},
): Promise<readonly AudioSegment[]> {
  const config = view.revision.config;
  if (config.sources.audio === "off") return [];
  const levelled =
    options.levelled === true && usesLoudness(config) && config.sources.audio === "generate";
  const input = async (role: "audio_body" | "audio_intro" | "audio_outro") => {
    const segment = role === "audio_body" ? "body" : role === "audio_intro" ? "intro" : "outro";
    const row = view.outputs.find(
      (one) =>
        one.selected &&
        one.available &&
        one.state === "ready" &&
        (levelled
          ? one.output.role === "audio_levelled" && one.workKey === levelKey(segment)
          : one.output.role === role),
    );
    if (row === undefined && levelled)
      throw new Error(
        `The levelled ${segment === "body" ? "narration" : segment} isn't finished yet, so the sound can't be exported at an even volume. Let the Narration stage finish (Resume, or Try again on it), then retry this stage; or turn off Level the volume in Edit project → Pauses and volume.`,
      );
    if (row === undefined) return undefined;
    const path = outputPath(deps.paths, context.work.projectId, row.output.path);
    const duration =
      row.output.durationMs ??
      (await (deps.measureAudio?.(path, context.signal) ??
        probeDurationMs(deps.ffmpeg, path, context.signal, deps.log)));
    if (!Number.isFinite(duration) || duration <= 0)
      throw new Error(
        "Slopify couldn't read the length of the narration audio, so the file may be damaged or empty. Regenerate the narration (or upload your audio file again in Edit project → Narration), then Try again.",
      );
    return { path, seconds: duration / 1000 };
  };
  const body = await input("audio_body");
  if (body === undefined)
    throw new Error(
      "The narration audio isn't finished yet. Let the Narration stage finish (Resume, or Try again on it), then retry this stage.",
    );
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
      edgeSeconds: config.edgeSilenceSeconds,
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
    usesPronunciationGlossary(view.revision.config) ||
    (kind === "body" && usesVoices(view.revision.config)) ||
    // Aliased requests say something other than the text; the transcript is the text.
    narrationAliasesOf(view.revision.config).length > 0
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
      throw new Error(
        "Some narration chunks aren't finished, so the full narration text isn't available. Let the Narration stage finish (Resume, or Try again on it), or regenerate the missing chunk in Edit project → Narration.",
      );
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
  throw new Error(
    `The saved text of the ${kind === "body" ? "article" : kind} is missing, so it can't be matched to the narration. Use More → Write the article again in the Article section, then Try again.`,
  );
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

// The body's speaker turns in narration order, as the plan asked for them: a native
// multi-speaker request lists its own lines, every other part says whose turn it speaks.
export function revisionTurns(snapshot: ExportSnapshot): readonly SpokenTurn[] {
  const { view, plan } = snapshot;
  if (!usesVoices(view.revision.config)) return [];
  const concat = plan.recipes.find((one) => one.key === "audio:body:concat");
  return (concat?.dependsOn ?? []).flatMap((key): readonly SpokenTurn[] => {
    const input = plan.recipes.find((one) => one.key === key)?.input;
    if (input?.kind !== "tts") return [];
    if (input.dialogue !== undefined)
      return input.dialogue.map((line) => ({
        speaker: line.speaker,
        turn: line.turn,
        text: line.text,
      }));
    return input.speaker === undefined || input.turn === undefined
      ? []
      : [{ speaker: input.speaker, turn: input.turn, text: input.spokenText ?? input.text }];
  });
}
