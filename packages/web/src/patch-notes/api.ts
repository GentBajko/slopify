import type { PatchNotesView } from "@app/slices/patch-notes/seen.js";
import { queryOptions } from "@tanstack/react-query";
import type { Api } from "@/api";
import { read, readText } from "@/http";

export type { PatchNotesView } from "@app/slices/patch-notes/seen.js";

export const patchNotesKey = ["patch-notes"] as const;

// The list, which note is the running version's and which (if any) is due to open by itself.
export function patchNotesQuery(api: Api) {
  return queryOptions({
    queryKey: patchNotesKey,
    queryFn: async () => read<PatchNotesView>(await api.client["patch-notes"].$get()),
    staleTime: Number.POSITIVE_INFINITY,
  });
}

// One note's Markdown. The notes ship with the app, so they never change while it runs.
export function patchNoteQuery(api: Api, id: string) {
  return queryOptions({
    queryKey: [...patchNotesKey, id] as const,
    queryFn: async () => readText(await api.client["patch-notes"][":id"].$get({ param: { id } })),
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export async function markPatchNotesSeen(api: Api): Promise<void> {
  await read<{ seen: true }>(await api.client["patch-notes"].seen.$post());
}
