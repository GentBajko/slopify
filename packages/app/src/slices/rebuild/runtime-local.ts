import { rmSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { z } from "zod";
import type { Log } from "../../kernel/log.js";
import type { StageContext } from "../../kernel/runner/index.js";
import type { StageRunResult } from "../../kernel/runner/work.js";
import { referenceKey } from "../admission/model.js";
import { plainText } from "../article/plain.js";
import { splitEndMatter } from "../article/split.js";
import { levelPieces } from "../loudness/level-pieces.js";
import { joinNarration } from "../narration/concat.js";
import { applyPauses, type PiecePauses, planPieces } from "../narration/pauses.js";
import type { PauseSettings } from "../narration/pauses-model.js";
import type { PreparedAsset } from "../storage/assets.js";
import { allocateAsset, discardPreparedAssets, sealAsset } from "../storage/assets.js";
import { outputPath } from "../storage/layout.js";
import type { OutputRole } from "../storage/model.js";
import { probeDurationMs, runFfmpeg } from "../video/ffmpeg.js";
import { turnJoinArgs } from "../voices/join.js";
import { levelOperation } from "./recipe-loudness.js";
import type { PieceNext } from "./recipe-pauses.js";
import { publishNarrationText } from "./runtime-narration-text.js";
import { executionPlan, executionView, savedCatalogue } from "./runtime-plan.js";
import type { ProviderExecutionDeps } from "./runtime-provider.js";
import {
  preparedResult,
  preparedText,
  preparedTexts,
  publishResult,
} from "./runtime-publication.js";
import type { WorkPiece } from "./work-records.js";

export interface LocalExecutionDeps extends ProviderExecutionDeps {
  readonly ffmpeg: string;
}

export async function executeLocalRecipe(
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
  const input = piece.input;
  if (input.kind === "provided") {
    if (input.assetId === null)
      throw new Error(
        "A file you uploaded for this project is missing. Upload it again in Edit project, then Try again.",
      );
    const row = z
      .object({ id: z.string(), project_id: z.string(), path: z.string(), created_at: z.string() })
      .parse(
        deps.db
          .prepare("SELECT * FROM project_assets WHERE id=? AND project_id=?")
          .get(input.assetId, context.work.projectId),
      );
    const asset: PreparedAsset = {
      id: row.id,
      projectId: row.project_id,
      path: row.path,
      createdAt: row.created_at,
      bytes: statSync(outputPath(deps.paths, row.project_id, row.path)).size,
    };
    const role: OutputRole | undefined =
      piece.key === "audio:provided"
        ? "audio_body"
        : piece.key === "thumbnail:image"
          ? "thumbnail"
          : piece.key === referenceKey
            ? "reference"
            : piece.key.startsWith("image:")
              ? "image"
              : undefined;
    await publishResult(
      deps,
      context,
      piece,
      role === undefined ? [] : [preparedResult(deps, context, piece, role, asset)],
      {},
      asset,
    );
    return "done";
  }
  if (input.kind !== "local")
    throw new Error(
      "Slopify hit an internal error (a local step was set up wrongly). Try again; if it happens again, use Download diagnostics in Settings and report it.",
    );
  if (input.operation === "narration-files-v1") {
    await publishNarrationText(deps, context, piece);
    return "done";
  }
  if (
    input.operation === "concat-narration" ||
    input.operation === "concat-turns-v1" ||
    input.operation === levelOperation
  ) {
    await concatenate(deps, context, piece);
    return "done";
  }
  if (input.operation === "provided-article" || input.operation === "manual-article") {
    const text = z.string().parse(input.values);
    const parts = splitEndMatter(text);
    await publishResult(
      deps,
      context,
      piece,
      preparedTexts(deps, context, piece, [
        ["article_md", "article.md", text],
        ["article_txt", "article.txt", plainText(parts.body)],
        ...(parts.sources ? [["sources", "sources.md", parts.sources] as const] : []),
        ...(parts.glossary ? [["glossary", "glossary.md", parts.glossary] as const] : []),
      ]),
      { text },
    );
    return "done";
  }
  if (input.operation === "provided-notes") {
    const text = z.string().parse(input.values);
    await publishResult(
      deps,
      context,
      piece,
      [preparedText(deps, context, piece, "notes", "notes.md", text)],
      { text },
    );
    return "done";
  }
  if (input.operation === "entry-text") {
    await publishResult(deps, context, piece, [], {
      text: z.string().parse(input.values),
      category: piece.key.includes(":intro:") ? "intro" : "outro",
    });
    return "done";
  }
  throw new Error(
    `Slopify hit an internal error (no handler for the step "${input.operation}"). Try again; if it happens again, use Download diagnostics in Settings and report it.`,
  );
}

async function concatenate(
  deps: LocalExecutionDeps,
  context: StageContext,
  piece: WorkPiece,
): Promise<void> {
  const view = executionView(deps, context.work.projectId, context.work.revisionId);
  if (view === undefined)
    throw new Error(
      "Slopify hit an internal error (the project version being built is missing). Try again; if it happens again, use Download diagnostics in Settings and report it.",
    );
  const row = deps.db
    .prepare("SELECT recipe_context FROM revision_work WHERE id=?")
    .get(context.work.workId);
  const plan = executionPlan(deps, view, savedCatalogue(row?.recipe_context));
  const recipe = plan.recipes.find(
    (candidate) => candidate.key === piece.key && candidate.fingerprint === piece.fingerprint,
  );
  if (recipe === undefined)
    throw new Error(
      "Slopify hit an internal error (the narration chunks to join no longer match the project's saved inputs). Try again; if it happens again, use Download diagnostics in Settings and report it.",
    );
  const files = recipe.dependsOn.map((key) => {
    const input = view.pieces.find(
      (candidate) =>
        candidate.key === key &&
        candidate.selected &&
        candidate.available &&
        candidate.piece.state === "done" &&
        candidate.fingerprint === plan.recipes.find((value) => value.key === key)?.fingerprint,
    );
    if (input?.assetId === null || input === undefined)
      throw new Error(
        "One narration chunk has no saved audio, so the narration can't be joined together. Regenerate the missing chunk in Edit project → Narration, then Try again.",
      );
    const asset = deps.db
      .prepare("SELECT path FROM project_assets WHERE id=? AND project_id=?")
      .get(input.assetId, context.work.projectId);
    return outputPath(deps.paths, context.work.projectId, z.string().parse(asset?.path));
  });
  // Level the volume repeats the join its recipe names, from the same pieces, each levelled
  // first (`recipe-loudness.ts`).
  const level = recipe.input.kind === "local" && recipe.input.operation === levelOperation;
  const [operation, values] =
    recipe.input.kind !== "local"
      ? ["", undefined]
      : level
        ? z.tuple([z.string(), z.unknown(), z.unknown()]).parse(recipe.input.values)
        : [recipe.input.operation, recipe.input.values];
  const pending = allocateAsset(deps, context.work.projectId, "narration.mp3");
  const piecesDirectory = join(dirname(pending.absolutePath), "levelled");
  try {
    const run = { bin: deps.ffmpeg, log: deps.log, signal: context.signal };
    const levelled = level ? await levelPieces(run, files, piecesDirectory) : undefined;
    // Pauses between sentences: planned from the pieces as spoken, made in what is joined.
    const pauses = pausesIn(values);
    const paced =
      pauses === undefined
        ? undefined
        : await applyPauses(
            run,
            levelled?.files ?? files,
            paceScaled(
              await planPieces(
                run,
                files.map((file, at) => ({
                  file,
                  text: pieceText(plan.recipes.find((one) => one.key === recipe.dependsOn[at])),
                  next: pauses.next[at] ?? "end",
                })),
                pauses.settings,
              ),
              operation === "concat-turns-v1" ? values : undefined,
            ),
            join(piecesDirectory, "paced"),
          );
    const joined = paced?.files ?? levelled?.files ?? files;
    const durationMs =
      operation === "concat-turns-v1"
        ? await joinTurns(run, joined, values, pending.absolutePath)
        : await joinNarration(
            { bin: deps.ffmpeg, log: deps.log },
            {
              files: joined,
              output: pending.absolutePath,
              listPath: join(dirname(pending.absolutePath), "parts.txt"),
              signal: context.signal,
              reencode: level || paced !== undefined,
            },
          );
    rmSync(piecesDirectory, { recursive: true, force: true });
    context.signal.throwIfAborted();
    const asset = sealAsset(deps, pending);
    const segment = /^(?:audio|level):(intro|outro)$/.exec(piece.key)?.[1] ?? "body";
    const role: OutputRole = level
      ? "audio_levelled"
      : piece.key === "audio:intro"
        ? "audio_intro"
        : piece.key === "audio:outro"
          ? "audio_outro"
          : "audio_body";
    const voice =
      view.revision.config.audio === undefined
        ? {}
        : {
            provider: view.revision.config.audio.provider,
            model: view.revision.config.audio.model,
            voice: view.revision.config.audio.voice,
          };
    await publishResult(
      deps,
      context,
      piece,
      [
        preparedResult(
          deps,
          context,
          piece,
          role,
          asset,
          durationMs,
          levelled === undefined
            ? voice
            : {
                ...voice,
                segment: segment as "intro" | "body" | "outro",
                loudness: levelled.report,
              },
        ),
      ],
      { durationMs },
      asset,
    );
    if (level) return;
    for (const key of recipe.dependsOn) {
      const retained = view.pieces.find(
        (candidate) => candidate.key === key && candidate.selected && candidate.available,
      );
      if (retained?.publicationId === null || retained === undefined) continue;
      const owner = deps.db
        .prepare("SELECT work_id FROM revision_work_pieces WHERE id=?")
        .get(retained.publicationId);
      if (typeof owner?.work_id === "string")
        deps.audioPreviews?.clear(context.work.projectId, owner.work_id);
    }
  } finally {
    rmSync(piecesDirectory, { recursive: true, force: true });
    discardPreparedAssets(deps, [pending]);
  }
}

// The pauses a join's values ask for (`recipe-pauses.ts`): its third value, when there is one.
function pausesIn(
  values: unknown,
): { readonly settings: PauseSettings; readonly next: readonly PieceNext[] } | undefined {
  const value = Array.isArray(values) ? values[2] : undefined;
  const parsed = z
    .tuple([
      z.literal("pauses-v1"),
      z.number(),
      z.number(),
      z.array(z.enum(["end", "turn", "sentence", "paragraph"])),
    ])
    .safeParse(value);
  if (!parsed.success) return undefined;
  const [, sentenceSeconds, paragraphSeconds, next] = parsed.data;
  return { settings: { sentenceSeconds, paragraphSeconds }, next };
}

// A speaker's pace plays their turn faster or slower, pauses included, so a turn's added
// silence is scaled by it to come out at the minimum.
function paceScaled<T extends { readonly pauses: PiecePauses; readonly padEnd: number }>(
  plans: readonly T[],
  turnValues: unknown,
): readonly T[] {
  const layout = Array.isArray(turnValues) ? turnValues[1] : undefined;
  if (!Array.isArray(layout)) return plans;
  return plans.map((plan, at) => {
    const pace = z.tuple([z.number().positive(), z.number()]).safeParse(layout[at]);
    const factor = pace.success ? pace.data[0] : 1;
    if (factor === 1) return plan;
    return {
      ...plan,
      padEnd: plan.padEnd * factor,
      pauses: {
        ...plan.pauses,
        inserts: plan.pauses.inserts.map((one) => ({ ...one, seconds: one.seconds * factor })),
      },
    };
  });
}

// The words a narration piece speaks, where its sentences end: the clean words of a request, or
// of a piece supplied as a file.
function pieceText(recipe: { readonly input: WorkPiece["input"] } | undefined): string {
  if (recipe === undefined) return "";
  const input = recipe.input;
  // The words as said: a prepared request's delivery tags take no time of their own.
  if (input.kind === "tts") return (input.spokenText ?? input.text).replace(/\[[^\]]*\]/g, "");
  if (
    input.kind === "provided" &&
    Array.isArray(input.semantic) &&
    typeof input.semantic[0] === "string"
  )
    return input.semantic[0];
  return "";
}

// A multi-voice narration: every turn at its speaker's pace with the gap between turns, as the
// recipe laid it out (`recipe-voices.ts`), measured off the file that was written. `values` is
// the concat-turns-v1 recipe's own values.
export async function joinTurns(
  run: { readonly bin: string; readonly log: Log; readonly signal: AbortSignal },
  files: readonly string[],
  values: unknown,
  output: string,
): Promise<number> {
  const layout = z
    .tuple([z.unknown(), z.array(z.tuple([z.number().positive(), z.number().nonnegative()]))])
    // The pauses between sentences may follow (`recipe-pauses.ts`); they were made already.
    .rest(z.unknown())
    .parse(values)[1];
  if (layout.length !== files.length || files.length === 0)
    throw new Error(
      "Slopify hit an internal error (the speaker turns to join don't match their audio). Try again; if it happens again, use Download diagnostics in Settings and report it.",
    );
  await runFfmpeg({
    bin: run.bin,
    args: turnJoinArgs(
      files.map((path, index) => ({
        path,
        pace: layout[index]?.[0] ?? 1,
        gapAfter: layout[index]?.[1] ?? 0,
      })),
      output,
    ),
    signal: run.signal,
    log: run.log,
    onProgress: (): void => {},
  });
  return probeDurationMs(run.bin, output, run.signal, run.log);
}
