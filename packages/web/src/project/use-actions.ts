import type { StageKind } from "@app/kernel/pipeline.js";
import type { SubtitleConfig } from "@app/slices/subtitles/model.js";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { Api, ProjectBody } from "@/api";
import { useApp } from "@/app-context";
import { keys } from "@/queries";
import type { ActionResult, ProviderChanges } from "./api.js";
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

// Everything the page can ask the server to change, and the one refusal line it shows when
// the server says no. The answer to every action is the whole project as the server now
// sees it (`edge/http/actions.ts`), so it is written straight into the cache: the lamps
// move on the response, not on a second request.

// Discarding an article edit is destructive - it throws the user's typing away, so it
// confirms - but it changes nothing the server holds, so it is not one of these.
export type Action =
  | Exclude<Destructive, { readonly kind: "discard-article" }>
  | { readonly kind: "retry"; readonly stage: StageKind }
  | { readonly kind: "pause" | "resume" }
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
  readonly refusal: Refusal | undefined;
  readonly dismissRefusal: () => void;
}

interface MutationInput {
  readonly projectId: string;
  readonly action: Action;
}

export function useProjectActions(projectId: string): ProjectActions {
  const { api } = useApp();
  const queryClient = useQueryClient();
  const [refusal, setRefusal] = useState<Refusal | undefined>(undefined);

  const mutation = useMutation({
    mutationFn: (input: MutationInput) => perform(api, input.projectId, input.action),
    onMutate: () => {
      setRefusal(undefined);
    },
    onSuccess: async (result, input) => {
      if (!result.ok) {
        setRefusal({ message: result.message, stage: stageOf(input.action) });
        return;
      }
      const { project, stages, outputs } = result.value;
      queryClient.setQueryData<ProjectBody>(keys.project(input.projectId), {
        project,
        stages,
        outputs,
      });
      void queryClient.invalidateQueries({ queryKey: keys.projects });
      // A second tab can change the paused run while this response is in transit.
      // Reconcile after painting the response so it cannot replace newer SSE data indefinitely.
      await queryClient.invalidateQueries({ queryKey: keys.project(input.projectId) });
    },
    onError: (error: Error, input) => {
      // Nothing is swallowed: a fault reaches the same line a refusal does, because the
      // user's next move is the same either way.
      setRefusal({ message: error.message, stage: stageOf(input.action) });
    },
  });

  return {
    run: (action, onDone) => {
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
    refusal,
    dismissRefusal: () => {
      setRefusal(undefined);
    },
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

function perform(api: Api, projectId: string, action: Action): Promise<ActionResult> {
  switch (action.kind) {
    case "pause":
      return pauseRun(api, projectId);
    case "resume":
      return resumeRun(api, projectId);
    case "providers":
      return updateProviders(api, projectId, action.choices);
    case "subtitles":
      return updateSubtitles(api, projectId, action.subtitles);
    case "cancel":
      return cancelRun(api, projectId);
    case "retry":
      return retryStage(api, projectId, action.stage);
    case "rerun":
      return rerunStage(api, projectId, action.stage);
    case "save-article":
      return saveArticle(api, projectId, action.markdown);
    case "delete-image":
      return deleteImage(api, projectId, action.outputId);
    case "regenerate-image":
      return regenerateImage(api, projectId, action.outputId);
  }
}
