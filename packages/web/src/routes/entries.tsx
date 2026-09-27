import type { Entry, EntryCategory } from "@app/slices/library/model.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { removeEntry } from "@/api";
import { useApp } from "@/app-context";
import { Button } from "@/components/kit/button";
import { Callout } from "@/components/kit/callout";
import { ConfirmDialog } from "@/components/kit/dialog";
import { EmptyState } from "@/components/kit/empty-state";
import { Input } from "@/components/kit/field";
import { ListDetail } from "@/components/kit/layout";
import { List, ListRow } from "@/components/kit/list-row";
import { Segmented } from "@/components/kit/switch";
import { categoryLabel, categoryOptions, modeLabel } from "@/lib/entry-options";
import { HistoryDrawer } from "@/library/history-drawer";
import { LibraryItemDetail, plural, updatedOn } from "@/library/item-detail";
import { ListSkeleton, LoadError, libraryListDetail, libraryRow } from "@/library/list-states";
import { LibraryRowActions } from "@/library/row-actions";
import { entriesQuery, keys } from "@/queries";
import { LibraryToolbar } from "@/routes/library";

// Every saved entry of one category, sorted by name by the list endpoint, beside the selected
// one's text, what uses it and its latest change. The category lives in the URL, so switching
// it is handed up to router.tsx rather than reaching for a router here - the same division
// Prompts makes.
export function EntriesRoute({
  category,
  onCategory,
  onUseInPlay,
  playBlocked,
}: {
  readonly category: EntryCategory;
  readonly onCategory: (next: EntryCategory) => void;
  // Opens Play with the entry picked (router.tsx wires the Play draft in).
  readonly onUseInPlay?: ((entry: Entry) => void) | undefined;
  readonly playBlocked?: string | undefined;
}) {
  const { api } = useApp();
  const queryClient = useQueryClient();
  const entries = useQuery(entriesQuery(api));
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);
  const [deleting, setDeleting] = useState<Entry | undefined>(undefined);
  const [history, setHistory] = useState<Entry | undefined>(undefined);

  const remove = useMutation({
    mutationFn: (id: string) => removeEntry(api, id),
    onSettled: async () => {
      setDeleting(undefined);
      await queryClient.invalidateQueries({ queryKey: keys.entries });
    },
  });

  const ofCategory = entries.data?.entries.filter((entry) => entry.category === category);
  const needle = query.trim().toLowerCase();
  const listed =
    needle === ""
      ? ofCategory
      : ofCategory?.filter(
          (entry) =>
            entry.name.toLowerCase().includes(needle) || entry.body.toLowerCase().includes(needle),
        );
  const selected = listed?.find((entry) => entry.id === selectedId) ?? listed?.[0];

  return (
    <div>
      <LibraryToolbar
        action={
          <Button asChild variant="primary">
            <Link to="/entries/new" search={{ category }}>
              New intro or outro
            </Link>
          </Button>
        }
      >
        <Input
          type="search"
          aria-label="Search intros and outros"
          placeholder="Search intros and outros"
          value={query}
          className="w-full min-w-0 sm:w-64"
          onChange={(event) => setQuery(event.target.value)}
        />
        <Segmented
          label="Entry category"
          value={category}
          options={categoryOptions.map((option) => ({ ...option, label: `${option.label}s` }))}
          onChange={onCategory}
        />
      </LibraryToolbar>

      {entries.error === null ? null : (
        <LoadError
          what="intros and outros"
          message={entries.error.message}
          onRetry={() => void entries.refetch()}
        />
      )}

      {listed === undefined || ofCategory === undefined ? (
        entries.error === null ? (
          <ListSkeleton label="Intros and outros" />
        ) : null
      ) : ofCategory.length === 0 ? (
        <EmptyCategory category={category} />
      ) : (
        <ListDetail
          className={libraryListDetail}
          list={
            listed.length === 0 ? (
              <p className="m-0 py-3 text-small text-ink-2">{`No ${category}s match "${query.trim()}".`}</p>
            ) : (
              <List label={`${categoryLabel(category)}s`}>
                {listed.map((entry) => (
                  <ListRow
                    key={entry.id}
                    className={libraryRow}
                    title={entry.name}
                    meta={entryMeta(entry)}
                    selected={entry.id === selected?.id}
                    onSelect={() => setSelectedId(entry.id)}
                    actions={
                      <LibraryRowActions
                        name={entry.name}
                        edit={
                          <Button asChild variant="quiet" size="small">
                            <Link
                              to="/entries/$entryId"
                              params={{ entryId: entry.id }}
                              aria-label={`Edit ${entry.name}`}
                            >
                              Edit
                            </Link>
                          </Button>
                        }
                        // The copy is named "<name> copy" and opened for editing, so a name
                        // that is already taken is renamed before it is ever saved.
                        duplicate={
                          <Button asChild variant="quiet" size="small">
                            <Link
                              to="/entries/new"
                              search={{ category: entry.category, from: entry.id }}
                              aria-label={`Duplicate ${entry.name}`}
                            >
                              Duplicate
                            </Link>
                          </Button>
                        }
                        play={{
                          run: onUseInPlay === undefined ? undefined : () => onUseInPlay(entry),
                          blocked: playBlocked,
                        }}
                        onHistory={() => setHistory(entry)}
                        onDelete={() => setDeleting(entry)}
                      />
                    }
                  />
                ))}
              </List>
            )
          }
          detail={
            selected === undefined ? null : (
              <LibraryItemDetail
                key={selected.id}
                item="entry"
                id={selected.id}
                name={selected.name}
                kicker={`${categoryLabel(selected.category)} · ${modeLabel(selected.mode)}`}
                meta={`Updated ${updatedOn(selected.updatedAt)}`}
                body={selected.body}
                slots={selected.slots}
                actions={
                  <Button asChild size="small">
                    <Link to="/entries/$entryId" params={{ entryId: selected.id }}>
                      {`Edit ${selected.category}`}
                    </Link>
                  </Button>
                }
                onOpenHistory={() => setHistory(selected)}
              />
            )
          }
        />
      )}

      {remove.error === null ? null : (
        <Callout tone="danger" title={`The ${category} wasn't deleted.`} className="mt-4">
          {remove.error.message}
        </Callout>
      )}

      {history === undefined ? null : (
        <HistoryDrawer
          key={history.id}
          item="entry"
          id={history.id}
          name={history.name}
          onClose={() => setHistory(undefined)}
        />
      )}

      <ConfirmDialog
        open={deleting !== undefined}
        title={deleting === undefined ? "" : `Delete "${deleting.name}"?`}
        // A project holds its own rendered text, so nothing it made is touched. It goes on
        // showing the name it was run with, marked "(deleted)".
        consequence="Moves it to the trash for 30 days (Settings → Trash). Projects that used it keep their text."
        confirmLabel={`Delete ${deleting?.category ?? category}`}
        pending={remove.isPending}
        onConfirm={() => {
          if (deleting !== undefined) remove.mutate(deleting.id);
        }}
        onCancel={() => setDeleting(undefined)}
      />
    </div>
  );
}

// Mode first: it says what the row does with its body (narrated as written, or an
// instruction whose answer is narrated).
function entryMeta(entry: Entry): string {
  return `${modeLabel(entry.mode)} · ${plural(entry.slots.length, "keyword")} · updated ${updatedOn(entry.updatedAt)}`;
}

// An empty category teaches what the thing is and where it lands in the run.
function EmptyCategory({ category }: { readonly category: EntryCategory }) {
  const where = category === "intro" ? "before" : "after";
  return (
    <EmptyState title={`No ${category}s yet`}>
      {`An ${category} is narrated ${where} the body in the run's voice.`}
    </EmptyState>
  );
}
