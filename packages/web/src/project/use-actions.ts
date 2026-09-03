import type { StageKind } from "@app/kernel/pipeline.js";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { Api, ProjectBody } from "@/api";
import { useApp } from "@/app-context";
import { keys } from "@/queries";
import type { ActionResult } from "./api.js";
import {
  cancelRun,
  deleteImage,
  regenerateImage,
  rerunStage,
  retryStage,
  saveArticle,
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
  | { readonly kind: "retry"; readonly stage: StageKind };

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

export function useProjectActions(projectId: string): ProjectActions {
  const { api } = useApp();
  const queryClient = useQueryClient();
  const [refusal, setRefusal] = useState<Refusal | undefined>(undefined);

  const mutation = useMutation({
    mutationFn: (action: Action) => perform(api, projectId, action),
    onMutate: () => {
      setRefusal(undefined);
    },
    onSuccess: (result, action) => {
      if (!result.ok) {
        setRefusal({ message: result.message, stage: stageOf(action) });
        return;
      }
      const { project, stages, outputs } = result.value;
      queryClient.setQueryData<ProjectBody>(keys.project(projectId), { project, stages, outputs });
      void queryClient.invalidateQueries({ queryKey: keys.projects });
    },
    onError: (error: Error, action) => {
      // Nothing is swallowed: a fault reaches the same line a refusal does, because the
      // user's next move is the same either way.
      setRefusal({ message: error.message, stage: stageOf(action) });
    },
  });

  return {
    run: (action, onDone) => {
      mutation.mutate(action, {
        onSuccess: (result) => {
          if (result.ok) {
            onDone?.();
          }
        },
      });
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
      return undefined;
    case "retry":
    case "rerun":
      return action.stage;
    case "save-article":
      return "article";
    case "delete-image":
    case "regenerate-image":
      return "images";
  }
}

function perform(api: Api, projectId: string, action: Action): Promise<ActionResult> {
  switch (action.kind) {
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
