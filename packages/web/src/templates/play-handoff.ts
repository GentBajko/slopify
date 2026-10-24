import { useNavigate } from "@tanstack/react-router";
import { usePlaySession } from "@/play/draft-context";

// How "Make a video" hands a template's fresh draft to Create: the open Create draft is saved
// first, a press that outlives a newer Create draft stops, and Create opens on the new draft.
// Templates and Edit template take it from the router, so their tests can pass their own.
export interface PlayHandoff {
  readonly onApplied: (draftId: string, isCurrent: () => boolean) => unknown | Promise<unknown>;
  readonly beforeApply?: (() => Promise<boolean>) | undefined;
  readonly getGeneration?: (() => number) | undefined;
  // A run is still starting on Create: a new draft would race it.
  readonly blocked?: boolean | undefined;
}

export function usePlayHandoff(): PlayHandoff {
  const session = usePlaySession();
  const navigate = useNavigate();
  return {
    getGeneration: session.generation,
    blocked: session.review.starting || session.review.uncertain || session.review.created !== null,
    beforeApply: session.flush,
    onApplied: async (draftId, isCurrent) => {
      if (!isCurrent()) return false;
      if (!(await session.open(draftId, isCurrent))) return false;
      if (!isCurrent()) return false;
      await navigate({ to: "/play" });
      return isCurrent();
    },
  };
}
