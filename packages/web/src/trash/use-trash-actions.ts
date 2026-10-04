import type { Restored, TrashItem } from "@app/slices/trash/model.js";
import { type UseMutationResult, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApp } from "@/app-context";
import { useToast } from "@/components/kit/toast";
import { counted } from "@/components/selection";
import {
  deleteTrashItem,
  deleteTrashItems,
  restoreTrashItem,
  restoreTrashItems,
  type TrashFailure,
  type TrashRef,
  trashKey,
} from "./api";
import { listsOf } from "./kinds";

// Restore and Delete now, for one item or many. Every outcome is a toast (role=status, or
// alert for a failure); a bulk action that partly failed says how many and the first reason.

function failureText(
  verb: string,
  failed: readonly TrashFailure[],
  total: number,
  items: readonly TrashItem[],
): string {
  const first = failed[0];
  if (first === undefined) return "";
  const name = items.find((item) => item.kind === first.kind && item.id === first.id)?.name;
  return `Could not ${verb} ${String(failed.length)} of ${counted(total, "item", "items")}. ${name === undefined ? "" : `"${name}": `}${first.detail}`;
}

interface Restoring {
  readonly restored: readonly Restored[];
  readonly failed: readonly TrashFailure[];
}
interface Deleting {
  readonly deleted: readonly TrashRef[];
  readonly failed: readonly TrashFailure[];
}

export function useTrashActions(): {
  readonly restore: UseMutationResult<Restoring, Error, readonly TrashItem[]>;
  readonly remove: UseMutationResult<Deleting, Error, readonly TrashItem[]>;
} {
  const { api } = useApp();
  const queryClient = useQueryClient();
  const notify = useToast();

  const refresh = async (items: readonly TrashItem[]): Promise<void> => {
    const lists = new Map<string, readonly string[]>([[trashKey.join("/"), trashKey]]);
    for (const item of items)
      for (const queryKey of listsOf[item.kind]) lists.set(queryKey.join("/"), queryKey);
    await Promise.all(
      [...lists.values()].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
    );
  };

  const restore = useMutation({
    mutationFn: async (items: readonly TrashItem[]): Promise<Restoring> => {
      const [only] = items;
      if (items.length === 1 && only !== undefined) {
        const restored = await restoreTrashItem(api, only.kind, only.id);
        return { restored: [restored], failed: [] };
      }
      return restoreTrashItems(api, items);
    },
    onSuccess: async ({ restored, failed }, items) => {
      await refresh(items);
      const [one] = restored;
      if (restored.length === 1 && one !== undefined)
        notify(
          one.renamedFrom === null
            ? `Restored "${one.name}".`
            : `Restored as "${one.name}": another item is now called "${one.renamedFrom}".`,
          "success",
        );
      else if (restored.length > 1) {
        const renamed = restored.filter((item) => item.renamedFrom !== null).length;
        notify(
          `Restored ${counted(restored.length, "item", "items")}.${renamed === 0 ? "" : ` ${counted(renamed, "came", "came")} back renamed because the name was taken.`}`,
          "success",
        );
      }
      if (restored.some((item) => item.kind === "schedule"))
        notify(
          restored.filter((item) => item.kind === "schedule").length === 1
            ? "The schedule is paused. Press Resume on Schedules to run it again."
            : "The schedules are paused. Press Resume on Schedules to run each again.",
          "info",
        );
      if (failed.length > 0) notify(failureText("restore", failed, items.length, items), "error");
    },
    onError: (error) => notify(error.message, "error"),
  });

  const remove = useMutation({
    mutationFn: async (items: readonly TrashItem[]): Promise<Deleting> => {
      const [only] = items;
      if (items.length === 1 && only !== undefined) {
        await deleteTrashItem(api, only.kind, only.id);
        return { deleted: [only], failed: [] };
      }
      return deleteTrashItems(api, items);
    },
    onSuccess: async ({ deleted, failed }, items) => {
      await refresh(items);
      const [one] = items;
      if (items.length === 1 && one !== undefined && failed.length === 0)
        notify(`Deleted "${one.name}" for good.`, "success");
      else if (deleted.length > 0)
        notify(`Deleted ${counted(deleted.length, "item", "items")} for good.`, "success");
      if (failed.length > 0) notify(failureText("delete", failed, items.length, items), "error");
    },
    onError: (error) => notify(error.message, "error"),
  });

  return { restore, remove };
}
