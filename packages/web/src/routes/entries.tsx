import { type Entry, type EntryCategory, nameMax } from "@app/slices/library/model.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactElement, useRef, useState } from "react";
import { removeEntry, saveEntry } from "@/api";
import { useApp } from "@/app-context";
import { Callout } from "@/components/kit/callout";
import { ariaKeyShortcuts, useSearchShortcut } from "@/components/kit/command-palette";
import { ConfirmDialog } from "@/components/kit/dialog";
import { EmptyState } from "@/components/kit/empty-state";
import { Input } from "@/components/kit/field";
import { ListDetail } from "@/components/kit/layout";
import { ButtonLink } from "@/components/kit/link";
import { List, ListRow } from "@/components/kit/list-row";
import { RowCheck, useSelection } from "@/components/selection";
import { categoryAbout, categoryLabel, modeLabel } from "@/lib/entry-options";
import { plural } from "@/lib/format";
import { LibraryBulkBar, SelectionArea } from "@/library/bulk-bar";
import { HistoryDrawer } from "@/library/history-drawer";
import { LibraryItemDetail } from "@/library/item-detail";
import { ListSkeleton, LoadError, libraryListDetail, libraryRow } from "@/library/list-states";
import { useLibraryItem } from "@/library/list-url";
import { PromptRowMeta, PromptsFrame, PromptsListHead } from "@/library/prompts-frame";
import { LibraryRowActions } from "@/library/row-actions";
import { sortLibrary, useLibrarySort } from "@/library/sort";
import { SortMenu } from "@/library/sort-menu";
import { Stamp } from "@/library/time";
import { TransferMenu } from "@/library/transfer-menu";
import { refusalOf, useLibraryBulk } from "@/library/use-library-bulk";
import { useLibraryTransfer } from "@/library/use-library-transfer";
import { entriesQuery, keys } from "@/queries";

// Prompts → Intros or Outros: the saved intros (or outros), by name or last change, beside the
// selected one's words. They sit in the Prompts page's list of kinds; a search looks through
// intros and outros both. The category and the selected row live in the URL, the same division
// Prompts makes.
export function EntriesRoute({
  category,
  onMakeVideo,
  makeBlocked,
}: {
  readonly category: EntryCategory;
  // Opens Create with the intro or outro picked (router.tsx wires the Create draft in).
  readonly onMakeVideo?: ((entry: Entry) => void) | undefined;
  readonly makeBlocked?: string | undefined;
}) {
  const { api } = useApp();
  const queryClient = useQueryClient();
  const entries = useQuery(entriesQuery(api));
  // The words typed belong to the list they were typed on: picking another clears them.
  const [typed, setTyped] = useState({ category, text: "" });
  const query = typed.category === category ? typed.text : "";
  const search = useRef<HTMLInputElement>(null);
  const searchKeys = useSearchShortcut(search, "intros and outros");
  const [selectedId, setSelectedId] = useLibraryItem();
  const [sort, setSort] = useLibrarySort("entry");
  const [deleting, setDeleting] = useState<Entry | undefined>(undefined);
  const [history, setHistory] = useState<Entry | undefined>(undefined);

  const remove = useMutation({
    mutationFn: (id: string) => removeEntry(api, id),
    onSettled: async () => {
      setDeleting(undefined);
      await queryClient.invalidateQueries({ queryKey: keys.entries });
    },
  });

  const all = entries.data?.entries ?? [];
  const ofCategory = entries.data?.entries.filter((entry) => entry.category === category);
  const needle = query.trim().toLowerCase();
  const searching = needle !== "";
  // A search looks through intros and outros both, by name and by words.
  const matching = searching
    ? entries.data?.entries.filter(
        (entry) =>
          entry.name.toLowerCase().includes(needle) || entry.body.toLowerCase().includes(needle),
      )
    : ofCategory;
  const listed = matching === undefined ? undefined : sortLibrary(matching, sort);
  const selected = listed?.find((entry) => entry.id === selectedId) ?? listed?.[0];
  const selection = useSelection(listed?.map((entry) => entry.id) ?? []);
  const chosen = listed?.filter((entry) => selection.has(entry.id)) ?? [];
  const noun = searching ? (["intro or outro", "intros and outros"] as const) : nounOf(category);
  const bulk = useLibraryBulk({
    noun,
    listKey: keys.entries,
    all,
    groupOf: (entry) => entry.category,
    nameMax,
    duplicate: async (entry, name) =>
      refusalOf(
        await saveEntry(
          api,
          { category: entry.category, mode: entry.mode, name, body: entry.body },
          undefined,
          entry.id,
        ),
      ),
    remove: (entry) => removeEntry(api, entry.id),
    trash: "entry",
    selection,
  });
  const transfer = useLibraryTransfer({
    section: "entries",
    pack: (items) => ({ entries: items }),
    stem: "intros-and-outros",
    noun: ["intro or outro", "intros and outros"],
    listKey: keys.entries,
    existing: all,
    groupOf: (entry) => entry.category,
    nameMax,
    save: (entry) => saveEntry(api, entry, undefined),
  });
  const empty = ofCategory !== undefined && ofCategory.length === 0 && !searching;

  return (
    <PromptsFrame
      shown={searching ? null : { category }}
      actions={
        <>
          <TransferMenu
            what="intros and outros"
            disabled={entries.data === undefined || transfer.importing}
            exports={[
              {
                label: `Export all ${plural(all.length, "intro or outro", "intros and outros")}`,
                run: () => transfer.exportItems(all),
                disabled: all.length === 0,
              },
            ]}
            accept=".json,application/json"
            onFile={transfer.importFile}
          />
          {/* An empty list offers its first one in its own empty state instead. */}
          {empty ? null : <NewEntryButton category={category} />}
        </>
      }
    >
      <PromptsListHead
        title={
          searching
            ? `${plural(listed?.length ?? 0, "intro or outro", "intros and outros")} match “${query.trim()}”`
            : `${categoryLabel(category)}s`
        }
        about={searching ? "Found in intros and outros." : categoryAbout(category)}
        tools={
          <>
            <Input
              type="search"
              ref={search}
              aria-label="Search intros and outros"
              aria-keyshortcuts={ariaKeyShortcuts(searchKeys)}
              placeholder="Search intros and outros"
              value={query}
              className="w-full min-w-0 sm:w-56"
              onChange={(event) => setTyped({ category, text: event.target.value })}
            />
            <SortMenu what="intros and outros" sort={sort} onSort={setSort} />
          </>
        }
      />

      {entries.error === null ? null : (
        <LoadError
          what="intros and outros"
          message={entries.error.message}
          onRetry={() => void entries.refetch()}
        />
      )}

      {listed === undefined ? (
        entries.error === null ? (
          <ListSkeleton label="Intros and outros" />
        ) : null
      ) : empty ? (
        <EmptyState title={`No ${category}s yet`} actions={<NewEntryButton category={category} />}>
          {categoryAbout(category)}
        </EmptyState>
      ) : (
        <ListDetail
          className={libraryListDetail}
          list={
            listed.length === 0 ? (
              <p className="m-0 py-3 text-small text-ink-2">{`No intro or outro has “${query.trim()}” in its name or words.`}</p>
            ) : (
              <SelectionArea selection={selection}>
                <LibraryBulkBar
                  selection={selection}
                  total={listed.length}
                  noun={noun}
                  scope={searching ? `Select all ${String(listed.length)} shown` : undefined}
                  busy={bulk.busy}
                  onDuplicate={() => bulk.duplicate(chosen)}
                  onExport={() => transfer.exportItems(chosen)}
                  onDelete={() => bulk.remove(chosen)}
                />
                <List label={searching ? "Intros and outros" : `${categoryLabel(category)}s`}>
                  {listed.map((entry) => (
                    <ListRow
                      key={entry.id}
                      className={libraryRow}
                      lead={<RowCheck selection={selection} value={entry.id} label={entry.name} />}
                      title={entry.name}
                      onSelect={() => setSelectedId(entry.id)}
                      meta={
                        <PromptRowMeta
                          kind={searching ? categoryLabel(entry.category) : undefined}
                          body={entry.body}
                          slots={entry.slots}
                        />
                      }
                      selected={entry.id === selected?.id}
                      actions={
                        <LibraryRowActions
                          name={entry.name}
                          edit={
                            <ButtonLink
                              to="/entries/$entryId"
                              params={{ entryId: entry.id }}
                              aria-label={`Edit ${entry.name}`}
                              variant="quiet"
                              size="small"
                            >
                              Edit
                            </ButtonLink>
                          }
                          // The copy is named "<name> copy" and opened for editing, so a name
                          // that is already taken is renamed before it is ever saved.
                          duplicate={
                            <ButtonLink
                              to="/entries/new"
                              search={{ category: entry.category, from: entry.id }}
                              aria-label={`Duplicate ${entry.name}`}
                              variant="quiet"
                              size="small"
                            >
                              Duplicate
                            </ButtonLink>
                          }
                          play={{
                            run: onMakeVideo === undefined ? undefined : () => onMakeVideo(entry),
                            blocked: makeBlocked,
                          }}
                          onHistory={() => setHistory(entry)}
                          onDelete={() => setDeleting(entry)}
                        />
                      }
                    />
                  ))}
                </List>
              </SelectionArea>
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
                meta={
                  <>
                    Updated <Stamp iso={selected.updatedAt} />
                  </>
                }
                body={selected.body}
                slots={selected.slots}
                actions={
                  <ButtonLink to="/entries/$entryId" params={{ entryId: selected.id }} size="small">
                    Edit
                  </ButtonLink>
                }
                onOpenHistory={() => setHistory(selected)}
              />
            )
          }
        />
      )}

      {remove.error === null ? null : (
        <Callout tone="danger" title={`The ${deleting?.category ?? category} wasn't deleted.`}>
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
    </PromptsFrame>
  );
}

function nounOf(category: EntryCategory): readonly [string, string] {
  return [category, `${category}s`];
}

function NewEntryButton({ category }: { readonly category: EntryCategory }): ReactElement {
  return (
    <ButtonLink to="/entries/new" search={{ category }} variant="primary">
      {`New ${category}`}
    </ButtonLink>
  );
}
