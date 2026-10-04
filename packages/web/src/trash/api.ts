import type { Restored, TrashItem, TrashKind } from "@app/slices/trash/model.js";
import type { Api } from "@/api";
import { failure, read } from "@/http";

export const trashKey = ["trash"] as const;

export async function readTrash(api: Api): Promise<readonly TrashItem[]> {
  return (await read<{ items: TrashItem[] }>(await api.client.trash.$get())).items;
}

// A refusal (its template is in the trash, the item is already gone) throws with the server's
// sentence, which the Trash section shows as a toast.
export async function restoreTrashItem(api: Api, kind: TrashKind, id: string): Promise<Restored> {
  const response = await api.client.trash[":kind"][":id"].restore.$post({ param: { kind, id } });
  return (await read<{ restored: Restored }>(response)).restored;
}

export async function deleteTrashItem(api: Api, kind: TrashKind, id: string): Promise<void> {
  const response = await api.client.trash[":kind"][":id"].$delete({ param: { kind, id } });
  if (!response.ok) throw await failure(response);
}

export interface TrashRef {
  readonly kind: TrashKind;
  readonly id: string;
}

// One item a bulk action could not do, with the server's sentence saying why and what to do.
export interface TrashFailure extends TrashRef {
  readonly reason: string;
  readonly detail: string;
}

// Restore selected / Restore all: each item on its own, so one refusal leaves the rest restored.
export async function restoreTrashItems(
  api: Api,
  items: readonly TrashRef[],
): Promise<{ readonly restored: readonly Restored[]; readonly failed: readonly TrashFailure[] }> {
  const response = await api.client.trash.bulk.restore.$post({ json: { items: [...items] } });
  return read<{ restored: Restored[]; failed: TrashFailure[] }>(response);
}

// Delete selected / Empty trash: removes each item for good.
export async function deleteTrashItems(
  api: Api,
  items: readonly TrashRef[],
): Promise<{ readonly deleted: readonly TrashRef[]; readonly failed: readonly TrashFailure[] }> {
  const response = await api.client.trash.bulk.delete.$post({ json: { items: [...items] } });
  return read<{ deleted: TrashRef[]; failed: TrashFailure[] }>(response);
}
