import type { StageKind, StageState } from "../../kernel/pipeline.js";
import { stageKinds } from "../../kernel/pipeline.js";
import { deps as graph } from "../../kernel/runner/graph.js";
import type { StageSource } from "../admission/model.js";

// `logic/12` step 9, verbatim: "every re-run marks its dependents `pending` and runs them
// automatically per scenario 01 §Q5, ending in a fresh render (§Q102)" - with the single
// exception §Q101 names for an article edit, where "prompt-based images are untouched".
//
// The rule is a function of the stage graph, the six current stage states, and the run's
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
  // gap, which is what §Q103's single image needs: one row and one file go, and the
  // stage remakes that one "in place at the same index".
  readonly clears: "all" | "nothing";
}

export interface StageStanding {
  readonly kind: StageKind;
  readonly state: StageState;
}

export interface CascadeInput {
  readonly action: RerunAction;
  readonly stages: readonly StageStanding[];
  // §Q101 splits the thumbnail in two: an LLM-written one is rewritten from the edited
  // article, a prompt-based one is not.
  readonly thumbnailSource: StageSource;
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
      return withDependents([action.stage]);
    case "article-edit": {
      // §Q101, in its own words: "audio, LLM-mode intro/outro text, LLM-written
      // thumbnail, and video re-run; prompt-based images are untouched". The video comes
      // along as a dependent of the audio, so it is never named here.
      const roots: StageKind[] = ["audio"];
      if (input.thumbnailSource === "prompt_by_llm") {
        roots.push("thumbnail");
      }
      return withDependents(roots);
    }
    case "image-deleted":
      // Step 5: the image is "removed from the set; video re-renders". The remaining
      // images stand, so the images stage itself is not redone.
      return withDependents(["video"]);
    case "image-regenerated":
      return withDependents(["images"]);
  }
}

// `logic/01` forbids `provided` → `running` and `skipped` → `running`, so a stage whose
// output the user supplied or switched off is stepped over. The walk above still passes
// through it: re-running the article with a provided audio must reach the video.
function redoable(state: StageState): boolean {
  return state !== "provided" && state !== "skipped";
}

function clearsOf(action: RerunAction, kind: StageKind): Redo["clears"] {
  return action.kind === "image-regenerated" && kind === "images" ? "nothing" : "all";
}

// The transitive closure of the dependents of `roots` over `kernel/runner/graph.ts`. The
// graph has six nodes, so one pass per node closes it whatever the edges are.
function withDependents(roots: readonly StageKind[]): ReadonlySet<StageKind> {
  const found = new Set<StageKind>(roots);
  for (let pass = 0; pass < stageKinds.length; pass += 1) {
    for (const kind of stageKinds) {
      if (graph[kind].some((dependency) => found.has(dependency))) {
        found.add(kind);
      }
    }
  }
  return found;
}

function stateOf(stages: readonly StageStanding[], kind: StageKind): StageState {
  return stages.find((stage) => stage.kind === kind)?.state ?? "pending";
}
