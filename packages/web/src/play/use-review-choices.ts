import type { QueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import type { Api } from "@/api";
import { keys } from "@/queries";
import { refreshDraftChoices } from "./draft-restore";
import type { ReviewOwner } from "./review-state";

// The checked setup stands while the lists it was checked against (prompts, services, models,
// fonts, settings) stand. Coming back to the window, or anything else on the page, reads them
// again; only a list that came back different drops the check, so a ready Make button does not
// go grey for the seconds a re-check takes when nothing changed.
export function useReviewChoices(api: Api, queryClient: QueryClient, review: ReviewOwner): void {
  useEffect(() => {
    const relevant = (key: readonly unknown[]) =>
      ["prompts", "entries", "providers", "provider-models", "fonts", "settings"].includes(
        String(key[0]),
      );
    const cache = queryClient.getQueryCache();
    // What each list held when last read. A refetch that brings back the same answer keeps the
    // same object (the query cache shares what did not change), so a new object is a change.
    const seen = new Map<string, unknown>();
    for (const query of cache.getAll())
      if (relevant(query.queryKey)) seen.set(query.queryHash, query.state.data);
    const unsubscribe = cache.subscribe((event) => {
      if (event.type !== "updated" || !relevant(event.query.queryKey)) return;
      if (event.action.type === "invalidate") {
        review.invalidate();
        return;
      }
      if (event.action.type !== "success") return;
      const data = event.query.state.data;
      const known = seen.has(event.query.queryHash);
      const before = seen.get(event.query.queryHash);
      seen.set(event.query.queryHash, data);
      if (!known || before !== data) review.invalidate();
    });
    const focus = () => {
      void refreshDraftChoices(api, queryClient);
      void queryClient.refetchQueries({ queryKey: keys.providerModels });
    };
    window.addEventListener("focus", focus);
    return () => {
      unsubscribe();
      window.removeEventListener("focus", focus);
    };
  }, [api, queryClient, review]);
}
