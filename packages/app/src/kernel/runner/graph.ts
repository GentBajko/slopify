import type { ProjectState, StageKind, StageState } from "../pipeline.js";

// Images use saved prompts and can run immediately. A thumbnail's source and an
// audio-only export narrow these dependencies through dependenciesOf(). The document is
// laid out from the article alone, with the thumbnail as its cover when there is one, so it
// runs beside narration and images rather than after them. The video never reads the
// thumbnail, so a thumbnail that fails does not hold the video back; neither does it hold
// the document back (see `optionalDeps`).
export const deps = {
  research: [],
  article: ["research"],
  audio: ["article"],
  images: [],
  thumbnail: ["article"],
  video: ["article", "audio", "images"],
  document: ["article", "thumbnail"],
} as const satisfies Readonly<Record<StageKind, readonly StageKind[]>>;

// Dependencies a stage waits for but can do without: the document takes the thumbnail as its
// cover when there is one. A thumbnail that failed or was canceled releases the document,
// which is then laid out with no cover, instead of holding it back with it. Making the
// thumbnail again still redoes the document (reruns/cascade.ts follows `deps`), so it gets
// its cover then.
export const optionalDeps: Readonly<Partial<Record<StageKind, readonly StageKind[]>>> = {
  document: ["thumbnail"],
};

// `provided` and `skipped` release a dependency exactly as `done` does.
export function satisfied(state: StageState): boolean {
  return state === "done" || state === "provided" || state === "skipped";
}

// Whether `dependency`, in `state`, lets `kind` start.
export function releases(kind: StageKind, dependency: StageKind, state: StageState): boolean {
  if (satisfied(state)) return true;
  return (
    (state === "failed" || state === "canceled") &&
    (optionalDeps[kind]?.includes(dependency) ?? false)
  );
}

export interface StageStanding {
  readonly kind: StageKind;
  readonly state: StageState;
  // Set on a `pending` stage waiting to run again by itself after a failure time can fix.
  readonly retryAt?: string | null | undefined;
}

// What a run is for, in order: the first of these the run asks for is the one that has to be
// there for the run to count as finished. Anything else failing leaves it done with
// problems rather than failed.
const headline: readonly StageKind[] = ["video", "audio", "article"];

// Stage state is derived; an explicit persisted pause takes precedence while calls
// drain. Completed independent images do not imply that a run was canceled. A stage
// waiting out a rate limit is still part of a run in progress.
export function derive(stages: readonly StageStanding[], paused = false): ProjectState {
  if (paused) return "paused";
  if (stages.some((stage) => stage.state === "running" || waiting(stage))) {
    return "running";
  }
  if (stages.some((stage) => stage.state === "canceled")) {
    return "canceled";
  }
  if (stages.some((stage) => stage.state === "failed")) {
    return headlineMade(stages) ? "partial" : "failed";
  }
  if (stages.length > 0 && stages.every((stage) => satisfied(stage.state))) {
    return "done";
  }
  // Includes a run created but not yet claimed and unfinished work after restart.
  return "pending";
}

function waiting(stage: StageStanding): boolean {
  return stage.state === "pending" && stage.retryAt !== undefined && stage.retryAt !== null;
}

function headlineMade(stages: readonly StageStanding[]): boolean {
  for (const kind of headline) {
    const stage = stages.find((one) => one.kind === kind);
    if (stage === undefined || stage.state === "skipped") continue;
    // A file the user supplied is not something this run made.
    return stage.state === "done";
  }
  return false;
}

export function dependenciesOf(
  kind: StageKind,
  sources: { readonly thumbnail: string; readonly video: string },
): readonly StageKind[] {
  if (kind === "thumbnail" && sources.thumbnail === "from_prompt") return [];
  if (kind === "video" && sources.video === "off") return ["article", "audio"];
  if (kind === "document" && sources.thumbnail === "off") return ["article"];
  return deps[kind];
}

// How far through itself a stage row is: chapters, chunks, images or a
// render percentage, counted by the slice that runs it.
export interface StageProgress extends StageStanding {
  readonly progressCurrent: number | null;
  readonly progressTotal: number | null;
}

// The thin meter under a running row on Projects, averaging stage progress. Every stage
// the run asks for counts once: a finished one whole, a running one by its own progress, a
// waiting, failed or canceled one not at all. `provided` and `skipped` are left out rather
// than counted as finished, which would put a run with a supplied article a third of the
// way along before the first call was made.
export function progressOf(stages: readonly StageProgress[]): number {
  const asked = stages.filter((stage) => stage.state !== "provided" && stage.state !== "skipped");
  // A run made entirely of supplied files has nothing outstanding; dividing by zero
  // would answer NaN.
  if (asked.length === 0) {
    return 1;
  }
  const share = asked.reduce((total, stage) => total + shareOf(stage), 0);
  return share / asked.length;
}

function shareOf(stage: StageProgress): number {
  if (satisfied(stage.state)) {
    return 1;
  }
  if (stage.state !== "running") {
    return 0;
  }
  const total = stage.progressTotal ?? 0;
  if (total <= 0) {
    // The stage has not said how many chapters or chunks there are yet. Guessing gives a
    // meter that moves backwards when the count arrives.
    return 0;
  }
  return Math.min(1, Math.max(0, (stage.progressCurrent ?? 0) / total));
}
