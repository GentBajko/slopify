import type { QueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import type { Api } from "@/api";
import { refreshDraftChoices } from "./draft-restore";
import type { ReviewOwner } from "./review-state";

export function useReviewChoices(api: Api, queryClient: QueryClient, review: ReviewOwner): void {
  useEffect(() => {
    const relevant = (key: readonly unknown[]) =>
      ["prompts", "entries", "providers", "provider-models", "fonts", "settings"].includes(
        String(key[0]),
      );
    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      if (
        event.type === "updated" &&
        relevant(event.query.queryKey) &&
        (event.action.type === "success" || event.action.type === "invalidate")
      )
        review.invalidate();
    });
    const focus = () => {
      review.invalidate();
      void refreshDraftChoices(api, queryClient);
      void queryClient.refetchQueries({ queryKey: ["provider-models"] });
    };
    window.addEventListener("focus", focus);
    return () => {
      unsubscribe();
      window.removeEventListener("focus", focus);
    };
  }, [api, queryClient, review]);
}
