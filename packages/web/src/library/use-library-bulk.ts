import { copyName } from "@app/slices/library/transfer.js";
import type { TrashKind } from "@app/slices/trash/model.js";
import { type QueryKey, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApp } from "@/app-context";
import { useToast } from "@/components/kit/toast";
import { counted, type Selection } from "@/components/selection";
import { restoreTrashItems, trashKey } from "@/trash/api";

// Duplicate selected and Delete selected for a Library tab. Each item is done on its own, so
// one refusal leaves the rest done; the toast says how many and the first reason. A delete
// that goes to the trash carries Undo, which restores those items from it.

export interface BulkItem {
  readonly id: string;
  readonly name: string;
}

interface Failure<T> {
  readonly item: T;
  readonly reason: string;
}

const reasonOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export function useLibraryBulk<T extends BulkItem>({
  noun,
  listKey,
  all,
  groupOf = () => "",
  nameMax,
  duplicate,
  remove,
  trash,
  selection,
}: {
  readonly noun: readonly [singular: string, plural: string];
  readonly listKey: QueryKey;
  // Every item of the tab, whose names a copy must not take.
  readonly all: readonly T[];
  // Names are unique within a group: a prompt kind, intros or outros.
  readonly groupOf?: (item: T) => string;
  readonly nameMax: number;
  // Saves a copy under `name`; answers the server's refusal, or null when it was saved.
  readonly duplicate: (item: T, name: string) => Promise<string | null>;
  readonly remove: (item: T) => Promise<void>;
  // The trash kind these items go to, or undefined when a delete is permanent.
  readonly trash: TrashKind | undefined;
  readonly selection: Selection<string>;
}): {
  readonly duplicate: (items: readonly T[]) => void;
  readonly remove: (items: readonly T[]) => void;
  readonly busy: boolean;
} {
  const { api } = useApp();
  const client = useQueryClient();
  const notify = useToast();
  const words = (count: number): string => counted(count, noun[0], noun[1]);
  const refresh = async (): Promise<void> => {
    await Promise.all([
      client.invalidateQueries({ queryKey: listKey }),
      ...(trash === undefined ? [] : [client.invalidateQueries({ queryKey: trashKey })]),
    ]);
  };
  const failed = (list: readonly Failure<T>[], what: string, fix: string): void => {
    const first = list[0];
    if (first === undefined) return;
    notify(
      `${words(list.length)} ${list.length === 1 ? "wasn't" : "weren't"} ${what}: “${first.item.name}”: ${first.reason} ${fix}`,
      "error",
    );
  };

  const copies = useMutation({
    mutationFn: async (items: readonly T[]) => {
      const taken = new Map<string, Set<string>>();
      for (const one of all) {
        const group = taken.get(groupOf(one)) ?? new Set<string>();
        group.add(one.name.trim().toLowerCase());
        taken.set(groupOf(one), group);
      }
      const made: string[] = [];
      const refused: Failure<T>[] = [];
      for (const item of items) {
        const names = taken.get(groupOf(item)) ?? new Set<string>();
        taken.set(groupOf(item), names);
        const name = copyName(item.name, names, nameMax);
        try {
          const reason = await duplicate(item, name);
          if (reason === null) {
            names.add(name.toLowerCase());
            made.push(name);
          } else refused.push({ item, reason });
        } catch (error) {
          refused.push({ item, reason: reasonOf(error) });
        }
      }
      return { made, refused };
    },
    onSuccess: ({ made, refused }) => {
      const [only] = made;
      if (made.length === 1 && only !== undefined) notify(`Duplicated as “${only}”.`, "success");
      else if (made.length > 1) notify(`Duplicated ${words(made.length)}.`, "success");
      failed(refused, "duplicated", "Press Duplicate selected again.");
    },
    onError: (error) =>
      notify(`Nothing was duplicated: ${reasonOf(error)} Press Duplicate selected again.`, "error"),
    onSettled: async () => {
      selection.clear();
      await refresh();
    },
  });

  const undo = async (items: readonly T[], kind: TrashKind): Promise<void> => {
    try {
      const answer = await restoreTrashItems(
        api,
        items.map((one) => ({ kind, id: one.id })),
      );
      if (answer.failed.length > 0)
        notify(
          `${words(answer.failed.length)} couldn't be restored: ${answer.failed[0]?.detail ?? ""} Restore ${answer.failed.length === 1 ? "it" : "them"} in Settings → Backup & storage → Trash.`,
          "error",
        );
      else notify(`Restored ${words(answer.restored.length)}.`, "success");
    } catch (error) {
      notify(
        `The ${noun[1]} weren't restored: ${reasonOf(error)} Restore them in Settings → Backup & storage → Trash.`,
        "error",
      );
    } finally {
      await refresh();
    }
  };

  const deletes = useMutation({
    mutationFn: async (items: readonly T[]) => {
      const done: T[] = [];
      const refused: Failure<T>[] = [];
      for (const item of items) {
        try {
          await remove(item);
          done.push(item);
        } catch (error) {
          refused.push({ item, reason: reasonOf(error) });
        }
      }
      return { done, refused };
    },
    onSuccess: ({ done, refused }) => {
      if (done.length > 0) {
        if (trash === undefined) notify(`Deleted ${words(done.length)} permanently.`, "success");
        else
          notify(`Moved ${words(done.length)} to the trash.`, "success", {
            label: "Undo",
            run: () => void undo(done, trash),
          });
      }
      failed(refused, "deleted", "Press Delete selected again.");
    },
    onError: (error) =>
      notify(`Nothing was deleted: ${reasonOf(error)} Press Delete selected again.`, "error"),
    onSettled: async () => {
      selection.clear();
      await refresh();
    },
  });

  return {
    duplicate: (items) => copies.mutate(items),
    remove: (items) => deletes.mutate(items),
    busy: copies.isPending || deletes.isPending,
  };
}

// A save's refusal as one sentence, or null when it was saved.
export function refusalOf(reply: {
  readonly ok: boolean;
  readonly fields?: readonly { readonly message: string }[];
}): string | null {
  return reply.ok ? null : (reply.fields ?? []).map((field) => field.message).join(" ");
}
