import { transact } from "../../kernel/db/tx.js";
import type { StageKind, StageState } from "../../kernel/pipeline.js";
import { stageKinds } from "../../kernel/pipeline.js";
import { storeArticleText } from "../article/store.js";
import { resolveChannelId, setProjectChannel } from "../channels/repo.js";
import { defaultDocumentTheme } from "../document/model.js";
import { earlierEpisodesFor } from "../episodes/related.js";
import { listNarrationAliases } from "../narration/aliases-library.js";
import { collectSharedGlossary } from "../narration/shared-glossary.js";
import { admitInitialRevision } from "../rebuild/runtime-admission.js";
import { adoptBaseline } from "../revisions/adopt.js";
import { insertAsset } from "../revisions/repo.js";
import { discardPreparedAssets, type PreparedAsset } from "../storage/assets.js";
import { prepareStagedFile } from "../storage/prepare.js";
import type { StorageDeps } from "../storage/staging.js";
import { attachStagedFile, storeText } from "../storage/staging.js";
import { releaseStagedFile } from "../storage/staging-refs.js";
import { usesAmbientBed } from "../video/ambient-bed.js";
import {
  type Project,
  type RunConfig,
  type RunDraft,
  type Stage,
  type StageSource,
  sourceOf,
} from "./model.js";
import { insertProject, insertStage } from "./repo.js";
import { usesPronunciationGlossary, usesReference } from "./rules.js";
import { detectSlots, render } from "./substitute.js";

export interface StartedRun {
  readonly project: Project;
  readonly stages: readonly Stage[];
}

// Provide → `provided` with its output attached; Off → `skipped`;
// everything else → `pending`.
export function initialState(source: StageSource): StageState {
  if (source === "provide") {
    return "provided";
  }
  return source === "off" ? "skipped" : "pending";
}

// The project row, its six stages and the provided content all land together or not at
// all. The caller ticks the runner after this returns, never inside it.
export function startRun(
  deps: StorageDeps,
  draft: RunDraft,
  rendered: Readonly<Record<string, string>>,
  retainStaged = false,
  templates?: Readonly<Record<string, string>>,
): StartedRun {
  const id = deps.ids.next();
  const at = deps.clock.now().toISOString();
  const shared =
    usesPronunciationGlossary(draft) && draft.audio?.shareGlossary === true
      ? collectSharedGlossary(deps).entries
      : [];
  // Library → Aliases as they are now: later edits there never change this project.
  const aliases =
    draft.sources.audio === "generate" && draft.audio?.useNarrationAliases === true
      ? listNarrationAliases(deps.db)
      : [];
  // The title may name keywords too ("History: {{Topic}}"), filled like a prompt's, so a
  // template or Play keeps the pattern and each project gets its own title.
  const title = render(draft.title, draft.values).trim() || draft.title;
  // The channel's related earlier episodes as they are now (`slices/episodes`): later edits
  // there never change this project. A draft never brings its own.
  const { earlierEpisodes: _carried, ...fresh } = draft;
  const earlier = earlierEpisodesFor(deps.db, draft, title);
  const config: RunConfig = {
    ...fresh,
    title,
    ...(title !== draft.title && detectSlots(draft.title).names.length > 0
      ? { titlePattern: draft.title }
      : {}),
    // A new project always names its document theme: a config without one reads as the
    // DiceMaster of older projects (see documentThemeOf), which no new project should get.
    ...(sourceOf(draft.sources, "document") === "generate" && draft.document === undefined
      ? { document: { theme: defaultDocumentTheme } }
      : {}),
    rendered,
    ...(shared.length === 0 ? {} : { sharedGlossary: shared }),
    ...(aliases.length === 0 ? {} : { narrationAliases: aliases }),
    ...(earlier === undefined ? {} : { earlierEpisodes: earlier }),
  };
  const project: Project = {
    id,
    title,
    format: draft.format,
    config,
    createdAt: at,
    updatedAt: at,
  };
  const stages: Stage[] = stageKinds.map((kind) => ({
    id: deps.ids.next(),
    projectId: id,
    kind,
    source: sourceOf(draft.sources, kind),
    state:
      kind === "video" && draft.sources.video === "off" && draft.sources.audio !== "off"
        ? "pending"
        : initialState(sourceOf(draft.sources, kind)),
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
  let music: PreparedAsset | undefined;
  let bed: PreparedAsset | undefined;
  try {
    transact(deps.db, () => {
      insertProject(deps.db, project);
      setProjectChannel(deps.db, id, resolveChannelId(deps.db, draft.channelId));
      for (const stage of stages) {
        insertStage(deps.db, stage);
      }
      attachProvided(deps, id, draft, moved, retainStaged);
      music = attachShortsMusic(deps, id, draft, moved);
      bed = attachAmbientBed(deps, id, draft, moved);
      // The music is named by the first revision, as Edit project → Shorts names it, so the
      // project gets its revision now even where it would otherwise wait for its first view.
      // The ambient bed's own file is named the same way.
      if (deps.catalogue !== undefined || music !== undefined || bed !== undefined) {
        const baseline = adoptBaseline(deps, id, templates, {
          ...(music === undefined ? {} : { shortsMusic: music.id }),
          ...(bed === undefined ? {} : { ambientBed: bed.id }),
        });
        if (!baseline.ok) throw new Error("The new project has no revision.");
        if (deps.catalogue !== undefined)
          admitInitialRevision(deps, baseline.view, deps.catalogue.read());
      }
    });
  } catch (error) {
    // The copy was written outside the transaction; nothing names it once it rolled back.
    const written = [music, bed].flatMap((asset) => (asset === undefined ? [] : [asset]));
    if (written.length > 0) discardPreparedAssets(deps, written);
    throw error;
  }
  for (const source of retainStaged ? [] : moved) {
    releaseStagedFile(deps, source);
  }

  return { project, stages };
}

function attachProvided(
  deps: StorageDeps,
  projectId: string,
  draft: RunDraft,
  collected: string[],
  retainStaged: boolean,
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
    // The end-matter split runs when the article becomes done *or provided*, so a pasted
    // Sources Consulted list is cut into its own file here exactly as the article stage cuts a
    // written one, and never reaches the narration.
    storeArticleText(deps, { projectId, markdown: provided.article.trim() });
  }
  if (sources.audio === "provide") {
    attach(deps, projectId, "audio", provided.audio, "audio_body", collected, retainStaged);
  }
  if (sources.thumbnail === "provide") {
    attach(deps, projectId, "thumbnail", provided.thumbnail, "thumbnail", collected, retainStaged);
  }
  if (usesReference(draft) && draft.reference?.source === "provide") {
    attach(deps, projectId, "images", provided.reference, "reference", collected, retainStaged);
  }
  if (sources.images === "provide") {
    // Slideshow order is the order the user left the list in.
    for (const [index, stagedFileId] of (provided.images ?? []).entries()) {
      attach(deps, projectId, "images", stagedFileId, "image", collected, retainStaged, index + 1);
    }
  }
}

// The Shorts step's background music, copied into the project as an asset of its own (never
// an output), exactly as Edit project → Shorts keeps an uploaded one. Only while Shorts is on.
function attachShortsMusic(
  deps: StorageDeps,
  projectId: string,
  draft: RunDraft,
  collected: string[],
): PreparedAsset | undefined {
  const stagedFileId = draft.provided.shortsMusic;
  if (draft.shorts?.enabled !== true || stagedFileId === undefined) return undefined;
  const result = prepareStagedFile(deps, { projectId, stagedFileId, role: "audio_body" });
  if (!result.ok)
    // admit() already refused a missing or still-copying file, as for the stages' own files.
    throw new Error(`the shorts' background music could not be attached: ${result.reason}`);
  insertAsset(deps.db, result.asset);
  collected.push(stagedFileId);
  return result.asset;
}

// The ambient bed's own file, copied into the project as an asset of its own like the shorts'
// music. Only while the long video gets the bed and its source is "upload".
function attachAmbientBed(
  deps: StorageDeps,
  projectId: string,
  draft: RunDraft,
  collected: string[],
): PreparedAsset | undefined {
  const stagedFileId = draft.provided.ambientBed;
  if (draft.ambientBed?.source !== "upload" || !usesAmbientBed(draft) || stagedFileId === undefined)
    return undefined;
  const result = prepareStagedFile(deps, { projectId, stagedFileId, role: "audio_body" });
  if (!result.ok)
    // admit() already refused a missing or still-copying file, as for the stages' own files.
    throw new Error(`the ambient sound's audio file could not be attached: ${result.reason}`);
  insertAsset(deps.db, result.asset);
  collected.push(stagedFileId);
  return result.asset;
}

function attach(
  deps: StorageDeps,
  projectId: string,
  kind: StageKind,
  stagedFileId: string | undefined,
  role: Parameters<typeof attachStagedFile>[1]["role"],
  collected: string[],
  retainStaged: boolean,
  index?: number,
): void {
  if (stagedFileId === undefined) {
    throw new Error(`the ${kind} stage is provided but carries no staged file`);
  }
  const result = attachStagedFile(deps, {
    stagedFileId,
    retainStaged,
    projectId,
    role,
    ...(index === undefined ? {} : { index }),
  });
  if (!result.ok) {
    // admit() already refused an unknown or still-copying upload, so reaching here means
    // the file went away between the check and the write.
    throw new Error(`the ${kind} stage's file could not be attached: ${result.reason}`);
  }
  collected.push(stagedFileId);
}
