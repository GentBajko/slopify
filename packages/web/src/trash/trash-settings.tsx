import type { TrashItem } from "@app/slices/trash/model.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactElement, useState } from "react";
import { useApp } from "@/app-context";
import { Button } from "@/components/kit/button";
import { ConfirmDialog } from "@/components/kit/dialog";
import { EmptyState } from "@/components/kit/empty-state";
import { List, ListRow } from "@/components/kit/list-row";
import { SectionHead } from "@/components/kit/section-head";
import { useToast } from "@/components/kit/toast";
import { keys } from "@/queries";
import { schedulesKey } from "@/schedules/api";
import { templatesKey } from "@/templates/api";
import { deleteTrashItem, readTrash, restoreTrashItem, trashKey } from "./api";

// Settings → Trash: what was deleted in the last 30 days (projects, Library prompts and
// intros/outros, templates, schedules), each with Restore and Delete now.

const kindLabels: Readonly<Record<TrashItem["kind"], string>> = {
  project: "Project",
  prompt: "Prompt",
  entry: "Intro/outro",
  template: "Template",
  schedule: "Schedule",
};

export function kindOf(item: TrashItem): string {
  if (item.kind === "entry" && item.detail !== null)
    return item.detail === "intro" ? "Intro" : "Outro";
  if (item.kind === "prompt" && item.detail !== null) return `Prompt · ${item.detail}`;
  return kindLabels[item.kind];
}

export function daysLeftText(daysLeft: number): string {
  if (daysLeft <= 0) return "removed for good today";
  return daysLeft === 1 ? "1 day left" : `${String(daysLeft)} days left`;
}

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

// The lists an item returns to, so they show it again at once.
const listsOf: Readonly<Record<TrashItem["kind"], readonly (readonly string[])[]>> = {
  project: [keys.projects, ["calendar"]],
  prompt: [keys.prompts],
  entry: [keys.entries],
  template: [templatesKey],
  schedule: [schedulesKey, ["calendar"]],
};

export function TrashSettings(): ReactElement {
  const { api } = useApp();
  const queryClient = useQueryClient();
  const notify = useToast();
  const trash = useQuery({ queryKey: trashKey, queryFn: () => readTrash(api) });
  const [deleting, setDeleting] = useState<TrashItem | undefined>(undefined);

  const refresh = async (item: TrashItem): Promise<void> => {
    await Promise.all(
      [trashKey, ...listsOf[item.kind]].map((queryKey) =>
        queryClient.invalidateQueries({ queryKey }),
      ),
    );
  };
  const restore = useMutation({
    mutationFn: (item: TrashItem) => restoreTrashItem(api, item.kind, item.id),
    onSuccess: async (restored, item) => {
      await refresh(item);
      notify(
        restored.renamedFrom === null
          ? `Restored "${restored.name}".`
          : `Restored as "${restored.name}": another item is now called "${restored.renamedFrom}".`,
        "success",
      );
      if (restored.kind === "schedule")
        notify("The schedule is paused. Press Resume on Schedules to run it again.", "info");
    },
    onError: (error) => notify(error.message, "error"),
  });
  const remove = useMutation({
    mutationFn: (item: TrashItem) => deleteTrashItem(api, item.kind, item.id),
    onSuccess: async (_nothing, item) => {
      setDeleting(undefined);
      await refresh(item);
      notify(`Deleted "${item.name}" for good.`, "success");
    },
    onError: (error) => {
      setDeleting(undefined);
      notify(error.message, "error");
    },
  });

  const items = trash.data ?? [];
  return (
    <div>
      <SectionHead
        title="Trash"
        info="Deleted projects, prompts, intros and outros, templates and schedules stay here for 30 days, then are removed for good along with a project's files."
      />
      {trash.isPending ? (
        <p className="text-small text-ink-3">Loading the trash…</p>
      ) : trash.error ? (
        <p role="alert" className="text-small text-danger">
          {trash.error.message}
        </p>
      ) : items.length === 0 ? (
        <EmptyState title="The trash is empty">
          Anything you delete stays here for 30 days before it is removed for good.
        </EmptyState>
      ) : (
        <List label="Deleted items">
          {items.map((item) => (
            <ListRow
              key={`${item.kind}:${item.id}`}
              title={item.name}
              meta={`${kindOf(item)} · deleted ${dateFormat.format(new Date(item.deletedAt))} · ${daysLeftText(item.daysLeft)}`}
              actions={
                <>
                  <Button
                    size="small"
                    disabled={restore.isPending || remove.isPending}
                    disabledReason="Working on it"
                    onClick={() => restore.mutate(item)}
                  >
                    Restore
                  </Button>
                  <Button
                    size="small"
                    variant="destructive"
                    disabled={restore.isPending || remove.isPending}
                    disabledReason="Working on it"
                    onClick={() => setDeleting(item)}
                  >
                    Delete now
                  </Button>
                </>
              }
            />
          ))}
        </List>
      )}
      <ConfirmDialog
        open={deleting !== undefined}
        title={deleting === undefined ? "" : `Delete "${deleting.name}" for good?`}
        consequence={
          deleting?.kind === "project"
            ? "The project and every file it produced are removed from disk. This cannot be undone."
            : deleting?.kind === "schedule"
              ? "The schedule leaves the trash and cannot be restored. Its run history stays on Schedules."
              : "It is removed for good. This cannot be undone."
        }
        confirmLabel="Delete for good"
        cancelLabel="Keep it"
        pending={remove.isPending}
        onConfirm={() => {
          if (deleting !== undefined) remove.mutate(deleting);
        }}
        onCancel={() => {
          if (!remove.isPending) setDeleting(undefined);
        }}
      />
    </div>
  );
}
