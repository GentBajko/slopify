import type { StageKind } from "@app/kernel/pipeline.js";
import type { RevisionControlInput } from "@app/slices/control/revision-control-schema.js";
import type { SubtitleConfig } from "@app/slices/subtitles/model.js";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import type { Api, ProjectBody } from "@/api";
import { readProject } from "@/api";
import { useApp } from "@/app-context";
import { keys } from "@/queries";
import type { ActionResult, ProviderChanges, RecoveryActionResult } from "./api.js";
import {
  cancelRun,
  deleteImage,
  pauseRun,
  regenerateImage,
  rerunStage,
  resumeRun,
  retryStage,
  saveArticle,
  updateProviders,
  updateSubtitles,
} from "./api.js";
import type { Destructive } from "./confirmations.js";
import { prepareRevision } from "./revision-api.js";

// Late responses and replayed control receipts belong to their original revision.
// Refetch the current projection after an action; never paint a stale receipt.

// Discarding an article edit is destructive - it throws the user's typing away, so it
// confirms - but it changes nothing the server holds, so it is not one of these.
export type Action =
  | Exclude<Destructive, { readonly kind: "discard-article" }>
  | { readonly kind: "retry"; readonly stage: StageKind }
  | { readonly kind: "pause" }
  | { readonly kind: "resume" }
  | { readonly kind: "providers"; readonly choices: ProviderChanges }
  | { readonly kind: "subtitles"; readonly subtitles: SubtitleConfig };

// A refused action, and where the user was standing when they asked for it. The sentence
// is shown under that stage's own row rather than at the top of the page, because that is
// where the press happened.
export interface Refusal {
  // The server's own sentence, verbatim: "At least one image must remain, so the last one
  // cannot be deleted.".
  readonly message: string;
  // Undefined for a cancel, which belongs to the project rather than to one stage.
  readonly stage: StageKind | undefined;
}

export interface ProjectActions {
  // `onDone` runs only when the server accepted the change. An editor closes on it, so a
  // refused save leaves the user's typing where it is: an edit in progress stays put.
  readonly run: (action: Action, onDone?: () => void) => void;
  readonly pending: boolean;
  // The action awaiting its answer, so only its own control says "Resuming…" or "Retrying…".
  readonly performing?: Action | undefined;
  readonly refusal: Refusal | undefined;
  readonly dismissRefusal: () => void;
  readonly notice?: string | undefined;
}

interface MutationInput {
  readonly projectId: string;
  readonly action: Action;
}

export function useProjectActions(projectId: string): ProjectActions {
  const { api } = useApp();
  const queryClient = useQueryClient();
  const [refusal, setRefusal] = useState<Refusal | undefined>(undefined);
  const [notice, setNotice] = useState<string | undefined>();

  const controls = useRef(new Map<string, RevisionControlInput>());
  const active = useRef(false);
  const mutation = useMutation({
    mutationFn: async (input: MutationInput): Promise<ActionResult | RecoveryActionResult> => {
      const action = input.action;
      if (!["pause", "cancel", "resume", "retry", "rerun"].includes(action.kind))
        return perform(api, input.projectId, action);
      const stage = action.kind === "retry" || action.kind === "rerun" ? action.stage : "";
      const key = `${input.projectId}:${action.kind}:${stage}`;
      let control = controls.current.get(key);
      if (!control) {
        let base = queryClient.getQueryData<ProjectBody>(keys.project(input.projectId))?.revisionId;
        if (!base) {
          const prepared = await prepareRevision(api, input.projectId);
          if (!prepared.ok) return { ok: false, message: prepared.message };
          base = prepared.value.view.revision.id;
        }
        control = { baseRevisionId: base, idempotencyKey: crypto.randomUUID() };
        controls.current.set(key, control);
      }
      // Keep the exact request after a transport/server fault, even if SSE advances the head.
      // Once the server has answered, the identity is spent: a later press is a new request.
      const result = await perform(api, input.projectId, action, control);
      controls.current.delete(key);
      if (result.ok) {
        // The action is already accepted; a failed refetch must not report it as failed.
        // onSuccess still invalidates the projection, which retries the read.
        await readProject(api, input.projectId).then(
          (fresh) => queryClient.setQueryData(keys.project(input.projectId), fresh),
          (error: unknown) =>
            console.warn("Project refresh after an accepted action failed", error),
        );
      }
      return result;
    },
    onMutate: () => {
      setRefusal(undefined);
      setNotice(undefined);
    },
    onSuccess: async (result, input) => {
      if (!result.ok) {
        setRefusal({ message: result.message, stage: stageOf(input.action) });
      } else {
        setNotice(
          "warnings" in result && result.warnings.length > 0
            ? result.warnings.join(" ")
            : undefined,
        );
        void queryClient.invalidateQueries({ queryKey: keys.projects });
      }
      await queryClient.invalidateQueries({ queryKey: keys.project(input.projectId) });
    },
    onSettled: () => {
      active.current = false;
    },
    onError: (error: Error, input) => {
      // Nothing is swallowed: a fault reaches the same line a refusal does, because the
      // user's next move is the same either way.
      setRefusal({ message: error.message, stage: stageOf(input.action) });
    },
  });

  return {
    run: (action, onDone) => {
      if (active.current) return;
      active.current = true;
      mutation.mutate(
        { projectId, action },
        {
          onSuccess: (result) => {
            if (result.ok) {
              onDone?.();
            }
          },
        },
      );
    },
    pending: mutation.isPending,
    performing: mutation.isPending ? mutation.variables?.action : undefined,
    refusal,
    dismissRefusal: () => {
      setRefusal(undefined);
    },
    notice,
  };
}

// Which row the sentence belongs under.
function stageOf(action: Action): StageKind | undefined {
  switch (action.kind) {
    case "cancel":
    case "pause":
    case "resume":
    case "providers":
      return undefined;
    case "retry":
    case "rerun":
      return action.stage;
    case "subtitles":
      return "video";
    case "save-article":
      return "article";
    case "delete-image":
    case "regenerate-image":
      return "images";
  }
}

function perform(
  api: Api,
  projectId: string,
  action: Action,
  control?: RevisionControlInput,
): Promise<ActionResult | RecoveryActionResult> {
  const required = (): RevisionControlInput => {
    if (!control) throw new Error("A saved revision and request identity are required.");
    return control;
  };
  switch (action.kind) {
    case "pause":
      return pauseRun(api, projectId, required());
    case "cancel":
      return cancelRun(api, projectId, required());
    case "resume":
      return resumeRun(api, projectId, required());
    case "retry":
      return retryStage(api, projectId, action.stage, required());
    case "rerun":
      return rerunStage(api, projectId, action.stage, required());
    case "providers":
      return updateProviders(api, projectId, action.choices);
    case "subtitles":
      return updateSubtitles(api, projectId, action.subtitles);
    case "save-article":
      return saveArticle(api, projectId, action.markdown);
    case "delete-image":
      return deleteImage(api, projectId, action.outputId);
    case "regenerate-image":
      return regenerateImage(api, projectId, action.outputId);
  }
}
