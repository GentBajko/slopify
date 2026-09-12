import type { QueryClient } from "@tanstack/react-query";
import type { Api } from "@/api";
import { entriesQuery, promptsQuery, providersQuery, settingsQuery, voicesQuery } from "@/queries";
import { fontsKey, listFonts } from "@/subtitles/api";

const activeKey = "slopify.play-draft";
export function rememberDraft(id: string | null): void {
  try {
    if (id) window.localStorage?.setItem(activeKey, id);
    else window.localStorage?.removeItem(activeKey);
  } catch (error) {
    console.warn("Active draft browser storage is unavailable", error);
  }
}
export function rememberedDraft(): string | null {
  try {
    return window.localStorage?.getItem(activeKey) ?? null;
  } catch (error) {
    console.warn("Active draft browser storage is unavailable", error);
    return null;
  }
}
export async function refreshDraftChoices(api: Api, queryClient: QueryClient): Promise<void> {
  const results = await Promise.allSettled([
    queryClient.fetchQuery({ ...providersQuery(api), staleTime: 0 }),
    queryClient.fetchQuery({ ...promptsQuery(api), staleTime: 0 }),
    queryClient.fetchQuery({ ...entriesQuery(api), staleTime: 0 }),
    queryClient.fetchQuery({ ...settingsQuery(api), staleTime: 0 }),
    queryClient.fetchQuery({ ...voicesQuery(api), staleTime: 0 }),
    queryClient.fetchQuery({ queryKey: fontsKey, queryFn: () => listFonts(api), staleTime: 0 }),
  ]);
  for (const result of results)
    if (result.status === "rejected")
      console.warn("Draft choices could not refresh", result.reason);
}
