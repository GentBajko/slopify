import type { TrashItem, TrashKind } from "@app/slices/trash/model.js";
import { useQuery } from "@tanstack/react-query";
import { type ReactElement, useMemo, useState } from "react";
import { useApp } from "@/app-context";
import { Button } from "@/components/kit/button";
import { ConfirmDialog } from "@/components/kit/dialog";
import { EmptyState } from "@/components/kit/empty-state";
import { List, ListRow } from "@/components/kit/list-row";
import { LoadFailed } from "@/components/kit/query-state";
import { SectionHead } from "@/components/kit/section-head";
import { Segmented } from "@/components/kit/switch";
import { counted, RowCheck, SelectionBar, useSelection } from "@/components/selection";
import { readTrash, trashKey } from "./api";
import {
  daysLeftText,
  deleteConsequence,
  deletedAt,
  itemKey,
  kindFilters,
  kindOf,
  whatComesHere,
  whatDoesNot,
} from "./kinds";
import { useTrashActions } from "./use-trash-actions";

export { daysLeftText, kindOf } from "./kinds";

// Settings → Trash: what was deleted in the last 30 days (projects, Library prompts and
// intros/outros, templates, schedules), each with Restore and Delete now; a filter by kind,
// selection for Restore selected / Delete selected, and Restore all / Empty trash for the lot.

type Filter = TrashKind | "all";

interface Confirming {
  readonly title: string;
  readonly label: string;
  readonly items: readonly TrashItem[];
}

export function TrashSettings(): ReactElement {
  const { api } = useApp();
  const trash = useQuery({ queryKey: trashKey, queryFn: () => readTrash(api) });
  const { restore, remove } = useTrashActions();
  const [filter, setFilter] = useState<Filter>("all");
  const [confirming, setConfirming] = useState<Confirming | undefined>(undefined);

  const items = trash.data ?? [];
  const present = kindFilters.filter((option) => items.some((item) => item.kind === option.value));
  const kind = present.some((option) => option.value === filter) ? filter : "all";
  const shown = useMemo(
    () => (kind === "all" ? items : items.filter((item) => item.kind === kind)),
    [items, kind],
  );
  const shownKeys = useMemo(() => shown.map(itemKey), [shown]);
  const selection = useSelection(shownKeys);
  const chosen = shown.filter((item) => selection.has(itemKey(item)));
  const busy = restore.isPending || remove.isPending;

  const askDelete = (title: string, label: string, list: readonly TrashItem[]): void =>
    setConfirming({ title, label, items: list });
  const confirmDelete = (): void => {
    if (confirming === undefined) return;
    remove.mutate(confirming.items, {
      onSettled: () => {
        setConfirming(undefined);
        selection.clear();
      },
    });
  };

  return (
    <div>
      <SectionHead
        title="Trash"
        info="settings.trash"
        meta={items.length === 0 ? undefined : `${whatComesHere} ${whatDoesNot}`}
      >
        <Button
          size="small"
          disabled={busy || items.length === 0}
          disabledReason={items.length === 0 ? "The trash is empty" : "Working on it"}
          onClick={() => restore.mutate(items, { onSuccess: selection.clear })}
        >
          Restore all
        </Button>
        <Button
          size="small"
          variant="destructive"
          disabled={busy || items.length === 0}
          disabledReason={items.length === 0 ? "The trash is empty" : "Working on it"}
          onClick={() =>
            askDelete(
              `Empty the trash: delete all ${counted(items.length, "item", "items")} for good?`,
              "Empty trash",
              items,
            )
          }
        >
          Empty trash
        </Button>
      </SectionHead>
      {trash.isPending ? (
        <p className="text-small text-ink-3">Loading the trash…</p>
      ) : trash.error ? (
        <LoadFailed
          what="The trash"
          error={trash.error}
          onRetry={() => void trash.refetch()}
          retrying={trash.isFetching}
          compact
        />
      ) : items.length === 0 ? (
        <EmptyState title="The trash is empty">
          {whatComesHere} {whatDoesNot}
        </EmptyState>
      ) : (
        // biome-ignore lint/a11y/noStaticElementInteractions: Esc anywhere in the list clears its selection; the rows' own controls take the focus.
        <div onKeyDown={selection.onKeyDown}>
          {present.length > 1 ? (
            <Segmented
              label="Filter by kind"
              value={kind}
              onChange={setFilter}
              options={[{ value: "all", label: "All" }, ...present]}
              className="mb-2"
            />
          ) : null}
          <SelectionBar
            selection={selection}
            total={shown.length}
            noun={["item", "items"]}
            {...(kind === "all" ? {} : { scope: `Select all ${String(shown.length)} shown` })}
            actions={
              <>
                <Button
                  size="small"
                  disabled={busy || selection.count === 0}
                  disabledReason={selection.count === 0 ? "Nothing is selected" : "Working on it"}
                  onClick={() => restore.mutate(chosen, { onSuccess: selection.clear })}
                >
                  Restore selected
                </Button>
                <Button
                  size="small"
                  variant="destructive"
                  disabled={busy || selection.count === 0}
                  disabledReason={selection.count === 0 ? "Nothing is selected" : "Working on it"}
                  onClick={() =>
                    askDelete(
                      `Delete ${counted(chosen.length, "selected item", "selected items")} for good?`,
                      "Delete for good",
                      chosen,
                    )
                  }
                >
                  Delete selected
                </Button>
              </>
            }
          />
          <List label="Deleted items">
            {shown.map((item) => {
              const at = deletedAt(item);
              return (
                <ListRow
                  key={itemKey(item)}
                  lead={<RowCheck selection={selection} value={itemKey(item)} label={item.name} />}
                  title={item.name}
                  meta={
                    <>
                      {kindOf(item)} · deleted{" "}
                      <time dateTime={item.deletedAt} title={at.full}>
                        {at.short}
                      </time>{" "}
                      · {daysLeftText(item.daysLeft)}
                    </>
                  }
                  actions={
                    <>
                      <Button
                        size="small"
                        disabled={busy}
                        disabledReason="Working on it"
                        onClick={() => restore.mutate([item])}
                      >
                        Restore
                      </Button>
                      <Button
                        size="small"
                        variant="destructive"
                        disabled={busy}
                        disabledReason="Working on it"
                        onClick={() =>
                          askDelete(`Delete "${item.name}" for good?`, "Delete for good", [item])
                        }
                      >
                        Delete now
                      </Button>
                    </>
                  }
                />
              );
            })}
          </List>
        </div>
      )}
      <ConfirmDialog
        open={confirming !== undefined}
        title={confirming?.title ?? ""}
        consequence={confirming === undefined ? "" : deleteConsequence(confirming.items)}
        confirmLabel={confirming?.label ?? "Delete for good"}
        cancelLabel={confirming?.items.length === 1 ? "Keep it" : "Keep them"}
        pending={remove.isPending}
        onConfirm={confirmDelete}
        onCancel={() => {
          if (!remove.isPending) setConfirming(undefined);
        }}
      />
    </div>
  );
}
