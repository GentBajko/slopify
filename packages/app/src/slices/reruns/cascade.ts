import type { StageKind, StageState } from "../../kernel/pipeline.js";
import { stageKinds } from "../../kernel/pipeline.js";
import { dependenciesOf } from "../../kernel/runner/graph.js";
import type { StageSource } from "../admission/model.js";

// Every re-run marks its source-dependent descendants `pending`. Prewritten image
// prompts are independent of article changes; an audio export is independent of images.
//
// The rule is a function of the stage graph, the six current stage states and the run's
// thumbnail source. Nothing here reads a row or a file: what the answer means for the
// database and the disk is `index.ts`'s, so this can be read and tested on its own.

export type RerunAction =
  | { readonly kind: "rerun"; readonly stage: StageKind }
  | { readonly kind: "article-edit" }
  | { readonly kind: "image-deleted" }
  | { readonly kind: "image-regenerated" };

export interface Redo {
  readonly stage: StageKind;
  // `all` throws the stage's outputs and its resumable pieces away, because what they
  // carry - the text a chunk was cut from, the prompt an image was sent with - is exactly
  // what changed. `nothing` keeps everything that landed and lets the stage fill in the
  // gap, which is what a single regenerated image needs: one row and one file go, and the
  // stage remakes that one in place at the same index.
  readonly clears: "all" | "nothing";
}

export interface StageStanding {
  readonly kind: StageKind;
  readonly state: StageState;
}

export interface CascadeInput {
  readonly action: RerunAction;
  readonly stages: readonly StageStanding[];
  // An article edit splits the thumbnail in two: an LLM-written one is rewritten from the
  // edited article, a prompt-based one is not.
  readonly thumbnailSource: StageSource;
  readonly videoSource?: StageSource;
}

// The stages to redo, in pipeline order, each with how much of itself it throws away.
export function redoPlan(input: CascadeInput): readonly Redo[] {
  const stale = staleStages(input);
  return stageKinds
    .filter((kind) => stale.has(kind) && redoable(stateOf(input.stages, kind)))
    .map((kind) => ({ stage: kind, clears: clearsOf(input.action, kind) }));
}

function staleStages(input: CascadeInput): ReadonlySet<StageKind> {
  const { action } = input;
  switch (action.kind) {
    case "rerun":
      return withDependents([action.stage], input);
    case "article-edit": {
      // An article edit re-runs audio, LLM-mode intro/outro text, the LLM-written
      // thumbnail and the video, leaving prompt-based images untouched. The video comes
      // along as a dependent of the audio, so it is never named here.
      const roots: StageKind[] = ["audio"];
      if (input.thumbnailSource === "prompt_by_llm") {
        roots.push("thumbnail");
      }
      return withDependents(roots, input);
    }
    case "image-deleted":
      // The image is removed from the set and the video re-renders. The remaining
      // images stand, so the images stage itself is not redone.
      return input.videoSource === "off" ? new Set() : withDependents(["video"], input);
    case "image-regenerated":
      return withDependents(["images"], input);
  }
}

// `provided` → `running` and `skipped` → `running` are forbidden, so a stage whose output
// the user supplied or switched off is stepped over. The walk above still passes
// through it: re-running the article with a provided audio must reach the video.
function redoable(state: StageState): boolean {
  return state !== "provided" && state !== "skipped";
}

function clearsOf(action: RerunAction, kind: StageKind): Redo["clears"] {
  // The previous video stays downloadable until the new render finishes. Clearing the video's
  // outputs here would take it away the moment the user pressed Re-render - or for the whole of
  // a re-narration, when the video comes along as a dependent. It is kept instead, and
  // `slices/video/run.ts` replaces the file and the rows in one swap once ffmpeg has exited
  // cleanly. A render that fails or is canceled leaves the old one standing.
  if (kind === "video") {
    return "nothing";
  }
  return action.kind === "image-regenerated" && kind === "images" ? "nothing" : "all";
}

// The transitive closure of the dependents of `roots` over `kernel/runner/graph.ts`. The
// graph has six nodes, so one pass per node closes it whatever the edges are.
function withDependents(roots: readonly StageKind[], input: CascadeInput): ReadonlySet<StageKind> {
  const found = new Set<StageKind>(roots);
  for (let pass = 0; pass < stageKinds.length; pass += 1) {
    for (const kind of stageKinds) {
      const dependencies = dependenciesOf(kind, {
        thumbnail: input.thumbnailSource,
        video: input.videoSource ?? "generate",
      });
      if (dependencies.some((dependency) => found.has(dependency))) {
        found.add(kind);
      }
    }
  }
  return found;
}

function stateOf(stages: readonly StageStanding[], kind: StageKind): StageState {
  return stages.find((stage) => stage.kind === kind)?.state ?? "pending";
}
