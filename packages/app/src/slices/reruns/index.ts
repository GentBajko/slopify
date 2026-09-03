import { rmSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import type { Clock } from "../../kernel/clock.js";
import { transact } from "../../kernel/db/tx.js";
import type { Ids } from "../../kernel/ids.js";
import type { Log } from "../../kernel/log.js";
import type { Paths } from "../../kernel/paths.js";
import type { StageKind, StageState } from "../../kernel/pipeline.js";
import type { StagePiece } from "../../kernel/runner/piece-repo.js";
import {
  allPiecesOf,
  deletePiece,
  deletePieces,
  setPiece,
} from "../../kernel/runner/piece-repo.js";
import type { Stage, StageSource } from "../admission/model.js";
import { projectById, resetStage, stagesOf } from "../admission/repo.js";
import { storeArticleText } from "../article/store.js";
import { outputPath } from "../storage/layout.js";
import type { Output, OutputRole } from "../storage/model.js";
import { pieceFile } from "../storage/reconcile.js";
import { deleteOutput, outputsOf } from "../storage/repo.js";
import { storeText } from "../storage/staging.js";
import type { RerunAction } from "./cascade.js";
import { redoPlan } from "./cascade.js";

// `logic/12`: every action on an existing project that changes an output. Each one puts
// the stages the change made stale back to `pending` and hands the caller the list; the
// caller ticks the runner, which is what actually starts them. Nothing here runs a stage,
// and nothing here calls a provider.

export interface RerunDeps {
  readonly db: DatabaseSync;
  readonly paths: Paths;
  readonly ids: Ids;
  readonly clock: Clock;
  readonly log: Log;
}

// Expected outcomes of the rules above, not faults: a refused delete is an answer the
// page shows, so it comes back as a value (03-conventions).
export type RerunRefusal =
  | "no-project"
  | "running"
  | "not-rerunnable"
  | "not-retryable"
  | "no-article"
  | "empty-article"
  | "unknown-image"
  | "last-image";

// Only the one field this module changes is named; the rest of a piece's payload belongs
// to the stage that wrote it and travels through untouched.
const anyObject = z.record(z.string(), z.unknown());

export type RerunResult =
  | { readonly ok: true; readonly redone: readonly StageKind[] }
  | { readonly ok: false; readonly reason: RerunRefusal };

// What an article edit replaces (step 1). `instructions` is not among them: §Q57 keeps
// the record of what was actually sent to the model, and an edit did not send anything.
const articleRoles: readonly OutputRole[] = ["article_md", "article_txt", "sources", "glossary"];

// `logic/13` step 5 and `logic/01` §Q5: Retry is offered on a stage that stopped short,
// and a canceled stage resumes exactly as a failed one does.
export function retryStage(deps: RerunDeps, projectId: string, kind: StageKind): RerunResult {
  const loaded = load(deps, projectId);
  if (!loaded.ok) {
    return loaded;
  }
  const stage = stageOf(loaded.stages, kind);
  if (stage === undefined || (stage.state !== "failed" && stage.state !== "canceled")) {
    return { ok: false, reason: "not-retryable" };
  }
  // The pieces and the outputs stay where they are: the per-stage resume rules keep what
  // finished (`logic/06` §Q54, `logic/08` §Q66, `logic/09` §Q73), and `logic/13` step 2
  // keeps them through a cancel too. That is the whole of "a canceled stage is resumable".
  transact(deps.db, () => {
    resetStage(deps.db, stage.id);
  });
  return { ok: true, redone: [kind] };
}

// Steps 2, 3 and 8: Re-run audio with another voice, Re-run images, Re-render. The stage
// starts over from the project's stored configuration rather than resuming.
export function rerunStage(deps: RerunDeps, projectId: string, kind: StageKind): RerunResult {
  const loaded = load(deps, projectId);
  if (!loaded.ok) {
    return loaded;
  }
  const stage = stageOf(loaded.stages, kind);
  if (stage === undefined || !rerunnable(stage.state)) {
    return { ok: false, reason: "not-rerunnable" };
  }
  return apply(deps, projectId, { kind: "rerun", stage: kind }, loaded);
}

// Step 1: "the inline editor replaces the stored markdown; the plain-text narration source
// and the sources and glossary files are rebuilt; then audio, LLM-mode intro/outro text,
// LLM-written thumbnail, and video re-run; prompt-based images are untouched".
//
// ceiling: the LLM-mode intro and outro texts are *not* rewritten from the edited article.
// Only the article stage writes them (`logic/07` step 5), and §Q60 makes any run of that
// stage regenerate the whole article - which would throw away the edit that triggered it.
// The audio does re-narrate the kept entry text, so the video is whole; the upgrade is a
// mode on the article stage that keeps the stored article and rewrites the entries alone.
export function editArticle(deps: RerunDeps, projectId: string, markdown: string): RerunResult {
  const loaded = load(deps, projectId);
  if (!loaded.ok) {
    return loaded;
  }
  const article = stageOf(loaded.stages, "article");
  if (article === undefined || (article.state !== "done" && article.state !== "provided")) {
    return { ok: false, reason: "no-article" };
  }
  const text = markdown.trim();
  if (text === "") {
    // §Q106 leaves a project with one output per stage; an empty article would leave the
    // audio stage with nothing to narrate and no way back except another edit.
    return { ok: false, reason: "empty-article" };
  }
  return apply(deps, projectId, { kind: "article-edit" }, loaded, () => {
    const replaced = loaded.outputs.filter((output) => articleRoles.includes(output.role));
    for (const output of replaced) {
      deleteOutput(deps.db, output.id);
    }
    // The four files are written back under the names they already had, so the write is
    // the replacement §Q106 asks for rather than a second version beside the first.
    storeText(deps, { projectId, stageKind: "article", role: "article_md", text });
    storeArticleText(deps, { projectId, markdown: text });
    return replaced.map((output) => output.path);
  });
}

// Step 5 with `logic/09` §Q75: one image is "removed from the set; at least one image must
// remain; video re-renders".
export function deleteImage(deps: RerunDeps, projectId: string, outputId: string): RerunResult {
  const loaded = load(deps, projectId);
  if (!loaded.ok) {
    return loaded;
  }
  const image = imageOf(loaded.outputs, outputId);
  if (image === undefined) {
    return { ok: false, reason: "unknown-image" };
  }
  if (loaded.outputs.filter((output) => output.role === "image").length <= 1) {
    // §Q103's invariant: "at least one image always remains". `logic/11` step 2 has no
    // slideshow to compute without one.
    return { ok: false, reason: "last-image" };
  }
  return apply(deps, projectId, { kind: "image-deleted" }, loaded, () => {
    // `slices/images/run.ts` counts an image as landed only when its row and its file both
    // survive, so a delete removes both - and the piece that planned it, or the next run
    // of the stage would read the plan and make the image again.
    deleteOutput(deps.db, image.id);
    dropImagePiece(deps, loaded.stages, image.path);
    return [image.path];
  });
}

// Step 4: "one new call with that image's stored prompt text, replacing it in place at the
// same index (§Q103)". The piece carries that prompt and that index, so it is left alone
// and the images stage sees one image of its plan missing.
export function regenerateImage(deps: RerunDeps, projectId: string, outputId: string): RerunResult {
  const loaded = load(deps, projectId);
  if (!loaded.ok) {
    return loaded;
  }
  const image = imageOf(loaded.outputs, outputId);
  if (image === undefined) {
    return { ok: false, reason: "unknown-image" };
  }
  return apply(deps, projectId, { kind: "image-regenerated" }, loaded, () => {
    deleteOutput(deps.db, image.id);
    forgetImageFile(deps, loaded.stages, image.path);
    return [image.path];
  });
}

interface Standing {
  readonly ok: true;
  readonly stages: readonly Stage[];
  readonly outputs: readonly Output[];
  readonly thumbnailSource: StageSource;
}

type Loaded = Standing | { readonly ok: false; readonly reason: RerunRefusal };

function load(deps: RerunDeps, projectId: string): Loaded {
  const project = projectById(deps.db, projectId);
  if (project === undefined) {
    return { ok: false, reason: "no-project" };
  }
  const stages = stagesOf(deps.db, projectId);
  // The precondition every action of `logic/12` shares: "no stage of the project is
  // `running` (§Q106)". The page disables the controls; this is the other half, because
  // clearing an output from under a stage that is writing it would lose both.
  if (stages.some((stage) => stage.state === "running")) {
    return { ok: false, reason: "running" };
  }
  return {
    ok: true,
    stages,
    outputs: outputsOf(deps.db, projectId),
    thumbnailSource: project.config.sources.thumbnail,
  };
}

// One transaction for every row the action touches, then the filesystem. S4's lesson:
// an unlink cannot be rolled back, so it waits for the commit - and a file with no row is
// what the boot reconcile collects, where a row with no file is a broken download.
function apply(
  deps: RerunDeps,
  projectId: string,
  action: RerunAction,
  loaded: Standing,
  own?: () => readonly string[],
): RerunResult {
  const plan = redoPlan({ action, stages: loaded.stages, thumbnailSource: loaded.thumbnailSource });
  // `own` is the action's own change - the new article, the image that goes - and it runs
  // first and inside the same transaction, so it lands or rolls back with the cascade it
  // triggers. The files it writes take the names they already had, which is the
  // replacement §Q106 asks for rather than work a rollback would have to undo.
  const orphaned = transact(deps.db, () => {
    const files = own === undefined ? [] : [...own()];
    for (const redo of plan) {
      const stage = stageOf(loaded.stages, redo.stage);
      if (stage === undefined) {
        continue;
      }
      if (redo.clears === "all") {
        files.push(...clearStage(deps, stage, loaded.outputs));
      }
      resetStage(deps.db, stage.id);
    }
    return files;
  });
  removeFiles(deps, projectId, orphaned);
  return { ok: true, redone: plan.map((redo) => redo.stage) };
}

// Everything the stage produced: its outputs, and the resumable pieces whose payloads name
// files of their own - the audio chunks of `logic/08` §Q65, which are not outputs.
function clearStage(deps: RerunDeps, stage: Stage, outputs: readonly Output[]): readonly string[] {
  const files: string[] = [];
  for (const output of outputs) {
    if (output.stageKind !== stage.kind) {
      continue;
    }
    files.push(output.path);
    deleteOutput(deps.db, output.id);
  }
  for (const piece of allPiecesOf(deps.db, stage.id)) {
    const file = pieceFile(piece.payload);
    if (file !== undefined) {
      files.push(file);
    }
  }
  deletePieces(deps.db, stage.id);
  return files;
}

// §Q103 replaces the image "in place at the same index", so the piece keeps the prompt
// and the index it was planned with and only stops naming a file: `slices/images/run.ts`
// then sees one image of its plan still to make, and the file it named can be removed.
function forgetImageFile(deps: RerunDeps, stages: readonly Stage[], path: string): void {
  for (const piece of imagePieces(deps, stages, path)) {
    if (piece.payload === null) {
      continue;
    }
    const parsed = anyObject.safeParse(JSON.parse(piece.payload));
    if (!parsed.success) {
      continue;
    }
    const kept = Object.entries(parsed.data).filter(([name]) => name !== "file");
    setPiece(deps.db, piece.id, "pending", JSON.stringify(Object.fromEntries(kept)));
  }
}

function dropImagePiece(deps: RerunDeps, stages: readonly Stage[], path: string): void {
  for (const piece of imagePieces(deps, stages, path)) {
    deletePiece(deps.db, piece.id);
  }
}

// The pieces of the images stage that name this file. There is one, unless a run before
// this one wrote two pieces onto the same path, which the reconcile would have to sort
// out anyway; taking all of them keeps the row set and the disk agreeing either way.
function imagePieces(
  deps: RerunDeps,
  stages: readonly Stage[],
  path: string,
): readonly StagePiece[] {
  const stage = stageOf(stages, "images");
  if (stage === undefined) {
    return [];
  }
  return allPiecesOf(deps.db, stage.id).filter((piece) => pieceFile(piece.payload) === path);
}

// Read back rather than reasoned about: an edit rewrites `article.md` under the same name
// it just deleted the row for, so what is still referenced after the commit is the only
// safe answer to what may be unlinked.
function removeFiles(deps: RerunDeps, projectId: string, orphaned: readonly string[]): void {
  const kept = new Set<string>(outputsOf(deps.db, projectId).map((output) => output.path));
  for (const stage of stagesOf(deps.db, projectId)) {
    for (const piece of allPiecesOf(deps.db, stage.id)) {
      const file = pieceFile(piece.payload);
      if (file !== undefined) {
        kept.add(file);
      }
    }
  }
  for (const path of new Set(orphaned)) {
    if (kept.has(path)) {
      continue;
    }
    try {
      rmSync(outputPath(deps.paths, projectId, path), { force: true });
    } catch (error) {
      // The row is already gone, so the next boot's reconcile removes the file. Failing
      // the action here would leave the user with a stage that cannot be re-run.
      deps.log.write("warn", "reruns.file", {
        projectId,
        detail: `${path}: ${messageOf(error)}`,
      });
    }
  }
}

// `logic/01`: `done` → `running` is scenario 12's own transition, and a stage that failed
// or was canceled may be started over rather than resumed. `provided` and `skipped` never
// run, and `pending` has nothing to redo.
function rerunnable(state: StageState): boolean {
  return state === "done" || state === "failed" || state === "canceled";
}

function stageOf(stages: readonly Stage[], kind: StageKind): Stage | undefined {
  return stages.find((stage) => stage.kind === kind);
}

function imageOf(outputs: readonly Output[], outputId: string): Output | undefined {
  return outputs.find((output) => output.id === outputId && output.role === "image");
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
