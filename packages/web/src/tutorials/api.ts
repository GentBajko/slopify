import type { TutorialHit, TutorialsIndex } from "@app/slices/tutorials/library.js";
import { queryOptions } from "@tanstack/react-query";
import type { Api } from "@/api";
import { read, readText } from "@/http";

export type { TutorialHit, TutorialsIndex } from "@app/slices/tutorials/library.js";

export const tutorialsKey = ["tutorials"] as const;

// Help → Tutorials' groups and pages. The pages ship with the app, so they never change while
// it runs and never need the network.
export function tutorialsQuery(api: Api) {
  return queryOptions({
    queryKey: tutorialsKey,
    queryFn: async () => read<TutorialsIndex>(await api.client.tutorials.$get()),
    staleTime: Number.POSITIVE_INFINITY,
  });
}

// One page's Markdown.
export function tutorialPageQuery(api: Api, page: string) {
  return queryOptions({
    queryKey: [...tutorialsKey, "page", page] as const,
    queryFn: async () => readText(await api.client.tutorials[":page"].$get({ param: { page } })),
    staleTime: Number.POSITIVE_INFINITY,
  });
}

// The sections of every page that hold the words typed.
export function tutorialSearchQuery(api: Api, query: string) {
  return queryOptions({
    queryKey: [...tutorialsKey, "search", query] as const,
    queryFn: async () =>
      read<{ readonly hits: readonly TutorialHit[] }>(
        await api.client.tutorials.search.$get({ query: { q: query } }),
      ),
    staleTime: Number.POSITIVE_INFINITY,
    enabled: query.trim() !== "",
  });
}
