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
import { Segmented } from "@/components/kit/switch";
import { RowCheck, useSelection } from "@/components/selection";
import { categoryLabel, categoryOptions, modeLabel } from "@/lib/entry-options";
import { LibraryBulkBar, SelectionArea } from "@/library/bulk-bar";
import { HistoryDrawer } from "@/library/history-drawer";
import { InlineName, refusedName } from "@/library/inline-name";
import { LibraryItemDetail, plural } from "@/library/item-detail";
import { ListSkeleton, LoadError, libraryListDetail, libraryRow } from "@/library/list-states";
import { useLibraryItem } from "@/library/list-url";
import { LibraryRowActions } from "@/library/row-actions";
import { sortLibrary, useLibrarySort } from "@/library/sort";
import { SortMenu } from "@/library/sort-menu";
import { Stamp } from "@/library/time";
import { TransferMenu } from "@/library/transfer-menu";
import { refusalOf, useLibraryBulk } from "@/library/use-library-bulk";
import { useLibraryTransfer } from "@/library/use-library-transfer";
import { entriesQuery, keys } from "@/queries";
import { LibraryToolbar } from "@/routes/library";

// Every saved entry of one category, by name or last change, beside the selected one's text,
// what uses it and its latest change; the selected row is `?item=` in the URL. The category lives in the URL, so switching
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

  // A rename from the list: the same save as the editor's, with the text as it is.
  const rename = async (entry: Entry, name: string): Promise<string | null> => {
    const reply = await saveEntry(
      api,
      { category: entry.category, mode: entry.mode, name, body: entry.body },
      entry.id,
    );
    await queryClient.invalidateQueries({ queryKey: keys.entries });
    return reply.ok ? null : refusedName(reply.fields);
  };

  const ofCategory = entries.data?.entries.filter((entry) => entry.category === category);
  const needle = query.trim().toLowerCase();
  const matching =
    needle === ""
      ? ofCategory
      : ofCategory?.filter(
          (entry) =>
            entry.name.toLowerCase().includes(needle) || entry.body.toLowerCase().includes(needle),
        );
  const listed = matching === undefined ? undefined : sortLibrary(matching, sort);
  const selected = listed?.find((entry) => entry.id === selectedId) ?? listed?.[0];
  const all = entries.data?.entries ?? [];
  const selection = useSelection(listed?.map((entry) => entry.id) ?? []);
  const chosen = listed?.filter((entry) => selection.has(entry.id)) ?? [];
  const noun = [category, `${category}s`] as const;
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

  return (
    <div>
      <LibraryToolbar
        action={
          <>
            <TransferMenu
              what="intros and outros"
              disabled={entries.data === undefined || transfer.importing}
              exports={[
                {
                  label: `Export all ${String(all.length)} intros and outros`,
                  run: () => transfer.exportItems(all),
                  disabled: all.length === 0,
                },
              ]}
              accept=".json,application/json"
              onFile={transfer.importFile}
            />
            <ButtonLink to="/entries/new" search={{ category }} variant="primary">
              New intro or outro
            </ButtonLink>
          </>
        }
      >
        <Input
          type="search"
          ref={search}
          aria-label="Search intros and outros"
          aria-keyshortcuts={ariaKeyShortcuts(searchKeys)}
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
          tip="library.entry.category"
        />
        <SortMenu what="intros and outros" sort={sort} onSort={setSort} />
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
              <SelectionArea selection={selection}>
                <LibraryBulkBar
                  selection={selection}
                  total={listed.length}
                  noun={noun}
                  scope={needle === "" ? undefined : `Select all ${String(listed.length)} shown`}
                  busy={bulk.busy}
                  onDuplicate={() => bulk.duplicate(chosen)}
                  onExport={() => transfer.exportItems(chosen)}
                  onDelete={() => bulk.remove(chosen)}
                />
                <List label={`${categoryLabel(category)}s`}>
                  {listed.map((entry) => (
                    <ListRow
                      key={entry.id}
                      className={libraryRow}
                      lead={<RowCheck selection={selection} value={entry.id} label={entry.name} />}
                      title={
                        <InlineName
                          name={entry.name}
                          onSelect={() => setSelectedId(entry.id)}
                          onRename={(name) => rename(entry, name)}
                        />
                      }
                      meta={entryMeta(entry)}
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
                    {`Edit ${selected.category}`}
                  </ButtonLink>
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
function entryMeta(entry: Entry): ReactElement {
  return (
    <>
      {`${modeLabel(entry.mode)} · ${plural(entry.slots.length, "keyword")} · updated `}
      <Stamp iso={entry.updatedAt} />
    </>
  );
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
