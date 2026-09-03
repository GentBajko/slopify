import { transact } from "../../kernel/db/tx.js";
import type { StageKind, StageState } from "../../kernel/pipeline.js";
import { stageKinds } from "../../kernel/pipeline.js";
import { storeArticleText } from "../article/store.js";
import type { StorageDeps } from "../storage/staging.js";
import { attachStagedFile, dropStagedSource, storeText } from "../storage/staging.js";
import type { Project, RunConfig, RunDraft, Stage, StageSource } from "./model.js";
import { insertProject, insertStage } from "./repo.js";

export interface StartedRun {
  readonly project: Project;
  readonly stages: readonly Stage[];
}

// logic/01 step 1: Provide → `provided` with its output attached; Off → `skipped`;
// everything else → `pending`.
export function initialState(source: StageSource): StageState {
  if (source === "provide") {
    return "provided";
  }
  return source === "off" ? "skipped" : "pending";
}

// logic/04 step 6 with 04-data-flow Run step 2: the project row, its six stages, and the
// provided content all land together or not at all. The caller ticks the runner after
// this returns, never inside it.
export function startRun(
  deps: StorageDeps,
  draft: RunDraft,
  rendered: Readonly<Record<string, string>>,
): StartedRun {
  const id = deps.ids.next();
  const at = deps.clock.now().toISOString();
  const config: RunConfig = { ...draft, rendered };
  const project: Project = {
    id,
    title: draft.title,
    format: draft.format,
    config,
    createdAt: at,
    updatedAt: at,
  };
  const stages: Stage[] = stageKinds.map((kind) => ({
    id: deps.ids.next(),
    projectId: id,
    kind,
    source: draft.sources[kind],
    state: initialState(draft.sources[kind]),
    failureReason: null,
    attemptCount: 0,
    progressCurrent: null,
    progressTotal: null,
    startedAt: null,
    finishedAt: null,
  }));

  // Filled inside the transaction, emptied after it. Every provided upload is copied into
  // the project folder rather than moved, so a rollback leaves the staging files exactly
  // as the form left them and the same Play can simply be pressed again.
  const moved: string[] = [];
  transact(deps.db, () => {
    insertProject(deps.db, project);
    for (const stage of stages) {
      insertStage(deps.db, stage);
    }
    attachProvided(deps, id, draft, moved);
  });
  for (const source of moved) {
    dropStagedSource(deps, source);
  }

  return { project, stages };
}

function attachProvided(
  deps: StorageDeps,
  projectId: string,
  draft: RunDraft,
  collected: string[],
): void {
  const { sources, provided } = draft;
  if (sources.research === "provide" && provided.research !== undefined) {
    storeText(deps, {
      projectId,
      stageKind: "research",
      role: "notes",
      text: provided.research.trim(),
    });
  }
  if (sources.article === "provide" && provided.article !== undefined) {
    // logic/08 step 1: the end-matter split runs when the article becomes done *or
    // provided*, so a pasted Sources Consulted list is cut into its own file here exactly
    // as the article stage cuts a written one, and never reaches the narration.
    storeArticleText(deps, { projectId, markdown: provided.article.trim() });
  }
  if (sources.audio === "provide") {
    attach(deps, projectId, "audio", provided.audio, "audio_body", collected);
  }
  if (sources.thumbnail === "provide") {
    attach(deps, projectId, "thumbnail", provided.thumbnail, "thumbnail", collected);
  }
  if (sources.images === "provide") {
    // logic/05 §Q39: slideshow order is the order the user left the list in.
    for (const [index, stagedFileId] of (provided.images ?? []).entries()) {
      attach(deps, projectId, "images", stagedFileId, "image", collected, index + 1);
    }
  }
}

function attach(
  deps: StorageDeps,
  projectId: string,
  kind: StageKind,
  stagedFileId: string | undefined,
  role: Parameters<typeof attachStagedFile>[1]["role"],
  collected: string[],
  index?: number,
): void {
  if (stagedFileId === undefined) {
    throw new Error(`the ${kind} stage is provided but carries no staged file`);
  }
  const result = attachStagedFile(deps, {
    stagedFileId,
    projectId,
    role,
    ...(index === undefined ? {} : { index }),
  });
  if (!result.ok) {
    // admit() already refused an unknown or still-copying upload, so reaching here means
    // the file went away between the check and the write.
    throw new Error(`the ${kind} stage's file could not be attached: ${result.reason}`);
  }
  collected.push(result.stagedSource);
}
