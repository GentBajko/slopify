import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import type { Clock } from "../../kernel/clock.js";
import { transact } from "../../kernel/db/tx.js";
import type { Ids } from "../../kernel/ids.js";
import type { Log } from "../../kernel/log.js";
import type { Paths } from "../../kernel/paths.js";
import type { GeneratedImage } from "../../kernel/ports/image.js";
import type { StageContext } from "../../kernel/runner/index.js";
import type { StagePiece } from "../../kernel/runner/piece-repo.js";
import { insertPiece, piecesOf, setPiece } from "../../kernel/runner/piece-repo.js";
import type { StageProviders } from "../../kernel/runner/providers.js";
import type { Format, ProviderChoice, RunConfig } from "../admission/model.js";
import { projectById, setStageProgress } from "../admission/repo.js";
import { outputFileName, outputPath } from "../storage/layout.js";
import type { Output } from "../storage/model.js";
import { insertOutput, outputsOf } from "../storage/repo.js";

// `logic/09`: every ticked image prompt is sent Number times as independent parallel
// calls, each one a resumable piece so a failure re-runs only what is missing, and each
// image appears on the page as it lands. Every call goes through the wrapped
// `providers.image`, so the retry policy of `logic/01` step 6 and its 300 s image timeout
// cover all of them and nothing here waits or counts attempts.

export interface ImagesDeps {
  readonly db: DatabaseSync;
  readonly paths: Paths;
  readonly ids: Ids;
  readonly clock: Clock;
  readonly log: Log;
}

// What an image piece carries between runs: what was asked for, and the file it came back
// as once the provider answered. That is the whole of the resume of §Q73.
const imagePayload = z.object({
  promptName: z.string(),
  prompt: z.string(),
  // Which ticked prompt this send belongs to, and which send of that prompt it is. Both
  // are stored rather than derived, because §Q75 lets the user delete an image and the
  // pieces that are left must still say where each one came from.
  promptIndex: z.number(),
  indexInPrompt: z.number(),
  file: z.string().optional(),
});

export type ImagePayload = z.infer<typeof imagePayload>;

export async function runImages(
  deps: ImagesDeps,
  context: StageContext,
  providers: StageProviders,
): Promise<void> {
  const { projectId } = context.stage;
  const project = projectById(deps.db, projectId);
  if (project === undefined) {
    throw new Error(`project ${projectId} has no row`);
  }
  const choice = project.config.images;
  if (choice === undefined) {
    // Admission refuses a run whose images are Generate without a provider and a model
    // (`logic/04` step 2), so reaching here is a bug in admission rather than the user's.
    throw new Error("the run has no image provider or model");
  }

  const pieces = plan(deps, context, project.config);
  if (pieces.length === 0) {
    // `logic/04` §Q31 makes an image source mandatory and step 3 puts the Number at one
    // or more, so an empty plan is a bug upstream rather than a run with no pictures.
    throw new Error("the run ticked no image prompt");
  }
  // Step 1: the run's own frame. The adapter turns it into whatever its provider spells
  // the closest supported size, and `logic/11` step 4 crops whatever is left over.
  await sendAll(deps, context, providers, choice, pieces, project.format);

  deps.log.write("info", "images.done", {
    projectId,
    stage: "images",
    detail: `${String(pieces.length)} images from ${String(project.config.imagePrompts.length)} prompts`,
  });
}

// Step 2 with `logic/04` §Q30: "for each ticked image prompt, send its rendered text
// Number times as independent parallel calls". The plan is made once and kept, so a retry
// finds the rows the first run wrote and sends only what did not land (§Q73).
//
// `idx` is the slideshow order of §Q72 - prompts in selection order, then the index within
// each prompt - so the order is fixed here and never depends on which image arrives first.
function plan(deps: ImagesDeps, context: StageContext, config: RunConfig): readonly StagePiece[] {
  const existing = piecesOf(deps.db, context.stage.id, "image");
  if (existing.length > 0) {
    return existing;
  }
  const planned: StagePiece[] = [];
  for (const [at, picked] of config.imagePrompts.entries()) {
    // `slices/library/slots.ts` names the rendered body after the draft field that picked
    // it, so the run carries the substituted text under this key (`logic/03`).
    const prompt = config.rendered[`imagePrompts.${String(at)}`];
    if (prompt === undefined) {
      throw new Error(`the run has no rendered text for the image prompt ${picked.name}`);
    }
    for (let send = 1; send <= picked.number; send += 1) {
      planned.push({
        id: deps.ids.next(),
        stageId: context.stage.id,
        kind: "image",
        idx: planned.length + 1,
        state: "pending",
        payload: JSON.stringify({
          promptName: picked.name,
          prompt,
          promptIndex: at + 1,
          indexInPrompt: send,
        } satisfies ImagePayload),
      });
    }
  }
  transact(deps.db, () => {
    for (const piece of planned) {
      insertPiece(deps.db, piece);
    }
  });
  return planned;
}

// §Q73: an image a previous run stored is not made again, and one that fails fails the
// whole stage while its siblings finish and keep their images for the next resume. A
// refusal is the wrapper's to make terminal (§Q74); nothing here counts attempts.
async function sendAll(
  deps: ImagesDeps,
  context: StageContext,
  providers: StageProviders,
  choice: ProviderChoice,
  pieces: readonly StagePiece[],
  format: Format,
): Promise<void> {
  const { projectId } = context.stage;
  // Read once, before anything is written: a piece counts as landed only when its row and
  // its file both survived, and the parallel sends below each add one of each.
  const stored = outputsOf(deps.db, projectId);
  const total = pieces.length;
  let done = pieces.filter((piece) => landed(deps, projectId, piece, stored)).length;
  report(deps, context, done, total);

  const outcomes = await Promise.all(
    pieces.map(async (piece): Promise<Outcome> => {
      const asked = payloadOf(piece);
      if (landed(deps, projectId, piece, stored)) {
        return { ok: true };
      }
      setPiece(deps.db, piece.id, "running", piece.payload);
      try {
        const made = await providers.forPiece(piece.id).image({
          provider: choice.provider,
          model: choice.model,
          prompt: asked.prompt,
          aspect: format,
        });
        const file = keep(deps, projectId, piece.idx, made);
        // §Q76: the prompt text, the prompt name, the index within the prompt, the
        // provider and the model travel with the image.
        const output = record(deps, projectId, piece, asked, file, made, choice);
        // The row and the file are both there before the piece says so: a crash between
        // them leaves a piece that is not `done`, which the next run simply sends again.
        setPiece(deps.db, piece.id, "done", JSON.stringify({ ...asked, file }));
        done += 1;
        // Step 3: the project page fills in as each one arrives.
        context.emit({ type: "image.landed", projectId, outputId: output.id, index: piece.idx });
        report(deps, context, done, total);
        return { ok: true };
      } catch (error) {
        // A cancel is not this image failing: `logic/13` §Q112 counts an aborted call as
        // nothing, and the resume runs a `pending` image exactly as a failed one.
        setPiece(deps.db, piece.id, context.signal.aborted ? "pending" : "failed", piece.payload);
        return { ok: false, error };
      }
    }),
  );

  for (const outcome of outcomes) {
    if (!outcome.ok) {
      throw outcome.error;
    }
  }
}

type Outcome = { readonly ok: true } | { readonly ok: false; readonly error: unknown };

// An image counts as landed only when its row and its file are both still there: they are
// written one after the other, the boot reconcile can remove a file whose row survived,
// and §Q75 lets the user delete one on purpose. Answering "done" for a missing file would
// hand the render a path to nothing.
function landed(
  deps: ImagesDeps,
  projectId: string,
  piece: StagePiece,
  stored: readonly Output[],
): boolean {
  const file = payloadOf(piece).file;
  if (file === undefined) {
    return false;
  }
  if (!stored.some((output) => output.role === "image" && output.path === file)) {
    return false;
  }
  return existsSync(outputPath(deps.paths, projectId, file));
}

function keep(deps: ImagesDeps, projectId: string, idx: number, made: GeneratedImage): string {
  // Step 3: "stored as received (png or jpg)". The adapter read the mime off the bytes,
  // so the extension is what the file actually is rather than what a header claimed.
  const name = outputFileName("image", idx, made.mime === "image/png" ? ".png" : ".jpg", "images");
  const target = outputPath(deps.paths, projectId, name);
  mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
  writeFileSync(target, made.bytes, { mode: 0o600 });
  return name;
}

function record(
  deps: ImagesDeps,
  projectId: string,
  piece: StagePiece,
  asked: ImagePayload,
  file: string,
  made: GeneratedImage,
  choice: ProviderChoice,
): Output {
  const output: Output = {
    id: deps.ids.next(),
    projectId,
    stageKind: "images",
    role: "image",
    path: file,
    originalFilename: null,
    bytes: made.bytes.byteLength,
    durationMs: null,
    // `index` is the slideshow place `logic/11` sorts on, and it is the piece's own `idx`
    // rather than the order the images came back in (§Q72).
    meta: {
      index: piece.idx,
      promptName: asked.promptName,
      prompt: asked.prompt,
      provider: choice.provider,
      model: choice.model,
    },
    createdAt: deps.clock.now().toISOString(),
  };
  insertOutput(deps.db, output);
  return output;
}

// `logic/01` §Q6: "k of N images made". Written as well as emitted, so a page opened
// mid-stage reads the count off the row rather than waiting for the next image.
function report(deps: ImagesDeps, context: StageContext, done: number, total: number): void {
  setStageProgress(deps.db, context.stage.id, done, total);
  context.emit({
    type: "stage.progress",
    projectId: context.stage.projectId,
    stage: "images",
    current: done,
    total,
  });
}

function payloadOf(piece: StagePiece): ImagePayload {
  if (piece.payload === null) {
    throw new Error(`image ${piece.id} has no payload`);
  }
  return imagePayload.parse(JSON.parse(piece.payload));
}
