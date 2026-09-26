import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { GeneratedImage } from "../../kernel/ports/image.js";
import type { StageContext } from "../../kernel/runner/index.js";
import type { StageProviders } from "../../kernel/runner/providers.js";
import type { StageRunResult } from "../../kernel/runner/work.js";
import { discardPreparedAssets, writeAsset } from "../storage/assets.js";
import { outputPath, projectDir } from "../storage/layout.js";
import { runFfmpeg } from "../video/ffmpeg.js";
import { executionView } from "./runtime-plan.js";
import type { ProviderExecutionDeps } from "./runtime-provider.js";
import { preparedResult, publishResult } from "./runtime-publication.js";
import type { WorkPiece } from "./work-records.js";

// Animate images: one still of the slideshow sent to the image provider's image-to-video
// model, and the clip it makes saved beside the image. The still goes up as a small JPEG, so
// the request stays well under what either provider takes inline.
//
// A clip that cannot be made is not worth failing the video for: after the provider's own
// retries the step finishes without a clip, saying why, and the render shows the still in
// its place and puts that sentence on the video (`runtime-export.ts`).

// ceiling: 1280 px on the long side is more than the 720p the catalogue's models are asked
// for, and keeps a JPEG to a few hundred KB.
const sentWidth = 1280;

export async function executeAnimateRecipe(
  deps: ProviderExecutionDeps,
  context: StageContext,
  providers: StageProviders,
  piece: WorkPiece,
): Promise<StageRunResult> {
  if (
    deps.db
      .prepare("SELECT state FROM revision_work_pieces WHERE id=? AND work_id=?")
      .get(piece.id, context.work.workId)?.state === "done"
  )
    return "done";
  const input = piece.input;
  if (input.kind !== "image" || input.animate === undefined)
    throw new Error(
      "Slopify hit an internal error (an animated image was set up wrongly). Use Retry stage; if it happens again, use Download diagnostics in Settings and report it.",
    );
  const imageKey = piece.key.slice("animate:".length);
  const view = executionView(deps, context.work.projectId, context.work.revisionId);
  const index = (view?.revision.content.imageOrder.indexOf(imageKey) ?? -1) + 1;
  const still = view?.outputs.find(
    (row) =>
      row.workKey === `image:${imageKey}` && row.selected && row.available && row.state === "ready",
  );
  const fallback = async (reason: string): Promise<StageRunResult> => {
    deps.log.write("warn", "video.animate.fallback", { detail: reason });
    await publishResult(deps, context, piece, [], {
      fallback: `Image ${String(index)} is shown as a still: ${reason}`,
    });
    return "done";
  };
  if (still === undefined)
    return fallback(
      "its image wasn't ready to animate. Use Re-run section on Video after the image is made.",
    );
  const animate = providers.forPiece(piece.id).animate;
  if (animate === undefined)
    throw new Error(
      "Slopify hit an internal error (animating images isn't wired up in this build). Use Retry stage; if it happens again, use Download diagnostics in Settings and report it.",
    );
  if (!context.maySubmit(piece.id)) return "held";
  let made: Awaited<ReturnType<typeof animate>>;
  try {
    made = await animate({
      provider: input.provider,
      model: input.model,
      prompt: input.prompt,
      image: await sendable(
        deps,
        context,
        outputPath(deps.paths, context.work.projectId, still.output.path),
      ),
      aspect: input.aspect,
      seconds: input.animate.seconds,
    });
  } catch (error) {
    if (context.signal.aborted) throw error;
    return fallback(
      `${error instanceof Error ? error.message : String(error)} To try again, use Re-run section on Video.`,
    );
  }
  if (!made.ok) return "held";
  const asset = writeAsset(deps, context.work.projectId, "animated.mp4", made.value.bytes);
  try {
    await publishResult(
      deps,
      context,
      piece,
      [
        preparedResult(deps, context, piece, "animated_image", asset, null, {
          index,
          prompt: input.prompt,
          provider: input.provider,
          model: input.model,
        }),
      ],
      { prompt: input.prompt },
      asset,
    );
    deps.count?.("stage.completed", {
      stage: context.work.kind,
      provider: input.provider,
      model: input.model,
    });
  } finally {
    discardPreparedAssets(deps, [asset]);
  }
  return "done";
}

// The still as a JPEG no wider than 1280 px, or as it is when there is no ffmpeg to shrink it.
async function sendable(
  deps: ProviderExecutionDeps,
  context: StageContext,
  path: string,
): Promise<GeneratedImage> {
  const original = (): GeneratedImage => {
    const bytes = new Uint8Array(readFileSync(path));
    return { bytes, mime: bytes[0] === 0xff ? "image/jpeg" : "image/png" };
  };
  if (deps.ffmpeg === undefined) return original();
  const scratch = mkdtempSync(join(projectDir(deps.paths, context.work.projectId), "animate-"));
  try {
    const output = join(scratch, "still.jpg");
    await runFfmpeg({
      bin: deps.ffmpeg,
      args: [
        ...["-hide_banner", "-nostdin", "-loglevel", "error", "-y", "-i", path],
        ...["-vf", `scale='min(${String(sentWidth)},iw)':-2`, "-frames:v", "1", "-q:v", "3"],
        output,
      ],
      signal: context.signal,
      log: deps.log,
      onProgress: () => undefined,
    });
    return { bytes: new Uint8Array(readFileSync(output)), mime: "image/jpeg" };
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}
