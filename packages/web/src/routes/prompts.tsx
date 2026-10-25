import { nameMax, type Prompt, type PromptKind } from "@app/slices/library/model.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactElement, useRef, useState } from "react";
import { removePrompt, savePrompt } from "@/api";
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
import { plural } from "@/lib/format";
import { kindAbout, kindLabel, kindNoun, kindSentence } from "@/lib/prompt-kinds";
import { LibraryBulkBar, SelectionArea } from "@/library/bulk-bar";
import { HistoryDrawer } from "@/library/history-drawer";
import { LibraryItemDetail } from "@/library/item-detail";
import { ListSkeleton, LoadError, promptListDetail, promptRow } from "@/library/list-states";
import { useLibraryItem } from "@/library/list-url";
import { PromptRowMeta, PromptsFrame, PromptsListHead } from "@/library/prompts-frame";
import { LibraryRowActions } from "@/library/row-actions";
import { sortLibrary, useLibrarySort } from "@/library/sort";
import { SortMenu } from "@/library/sort-menu";
import { Stamp } from "@/library/time";
import { TransferMenu } from "@/library/transfer-menu";
import { refusalOf, useLibraryBulk } from "@/library/use-library-bulk";
import { useLibraryTransfer } from "@/library/use-library-transfer";
import { keys, promptsQuery } from "@/queries";
import { trashKey } from "@/trash/api";

// Prompts: every kind down the left with its count, the saved prompts of the one picked (by
// name or last change) beside the selected one's text. A search looks through every kind at
// once and says each hit's kind. The kind and the selected row live in the URL (`?kind=`,
// `?item=`), so a link opens the same list on the same prompt.
export function PromptsRoute({
  kind,
  onMakeVideo,
  makeBlocked,
}: {
  readonly kind: PromptKind;
  // Opens Create with the prompt picked (router.tsx wires the Create draft in).
  readonly onMakeVideo?: ((prompt: Prompt) => void) | undefined;
  readonly makeBlocked?: string | undefined;
}) {
  const { api } = useApp();
  const queryClient = useQueryClient();
  const prompts = useQuery(promptsQuery(api));
  // The words typed belong to the kind they were typed on: picking another kind clears them.
  const [typed, setTyped] = useState({ kind, text: "" });
  const query = typed.kind === kind ? typed.text : "";
  const search = useRef<HTMLInputElement>(null);
  const searchKeys = useSearchShortcut(search, "prompts");
  const [selectedId, setSelectedId] = useLibraryItem();
  const [sort, setSort] = useLibrarySort("prompt");
  const [deleting, setDeleting] = useState<Prompt | undefined>(undefined);
  const [history, setHistory] = useState<Prompt | undefined>(undefined);

  const remove = useMutation({
    mutationFn: (id: string) => removePrompt(api, id),
    onSettled: async () => {
      setDeleting(undefined);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.prompts }),
        queryClient.invalidateQueries({ queryKey: trashKey }),
      ]);
    },
  });

  const all = prompts.data?.prompts ?? [];
  const ofKind = prompts.data?.prompts.filter((prompt) => prompt.kind === kind);
  const needle = query.trim().toLowerCase();
  const searching = needle !== "";
  // A search looks through every kind, by name and by text.
  const matching = searching
    ? prompts.data?.prompts.filter(
        (prompt) =>
          prompt.name.toLowerCase().includes(needle) || prompt.body.toLowerCase().includes(needle),
      )
    : ofKind;
  const listed = matching === undefined ? undefined : sortLibrary(matching, sort);
  const selected = listed?.find((prompt) => prompt.id === selectedId) ?? listed?.[0];
  const selection = useSelection(listed?.map((prompt) => prompt.id) ?? []);
  const chosen = listed?.filter((prompt) => selection.has(prompt.id)) ?? [];
  const bulk = useLibraryBulk({
    noun: ["prompt", "prompts"],
    listKey: keys.prompts,
    all,
    groupOf: (prompt) => prompt.kind,
    nameMax,
    duplicate: async (prompt, name) =>
      refusalOf(
        await savePrompt(api, { kind: prompt.kind, name, body: prompt.body }, undefined, prompt.id),
      ),
    remove: (prompt) => removePrompt(api, prompt.id),
    trash: "prompt",
    selection,
  });
  const transfer = useLibraryTransfer({
    section: "prompts",
    pack: (items) => ({ prompts: items }),
    stem: "prompts",
    noun: ["prompt", "prompts"],
    listKey: keys.prompts,
    existing: all,
    groupOf: (prompt) => prompt.kind,
    nameMax,
    save: (prompt) => savePrompt(api, prompt, undefined),
  });
  const empty = ofKind !== undefined && ofKind.length === 0 && !searching;

  return (
    <PromptsFrame
      shown={{ kind }}
      actions={
        <>
          <TransferMenu
            what="prompts"
            disabled={prompts.data === undefined || transfer.importing}
            exports={[
              {
                label: `Export all ${plural(all.length, "prompt")}`,
                run: () => transfer.exportItems(all),
                disabled: all.length === 0,
              },
            ]}
            accept=".json,application/json"
            onFile={transfer.importFile}
          />
          {/* An empty kind offers its first prompt in its own empty state instead. */}
          {empty ? null : <NewPromptButton kind={kind} />}
        </>
      }
    >
      <PromptsListHead
        title={
          searching
            ? `${plural(listed?.length ?? 0, "prompt")} match “${query.trim()}”`
            : `${kindLabel(kind)} prompts`
        }
        about={searching ? "Found in every kind." : empty ? undefined : kindAbout(kind)}
        tools={
          <>
            <Input
              type="search"
              ref={search}
              aria-label="Search prompts"
              aria-keyshortcuts={ariaKeyShortcuts(searchKeys)}
              placeholder="Search all prompts"
              value={query}
              className="w-full min-w-0 sm:w-56"
              onChange={(event) => setTyped({ kind, text: event.target.value })}
            />
            {/* Nothing to order in an empty list. */}
            {empty ? null : <SortMenu what="prompts" sort={sort} onSort={setSort} />}
          </>
        }
      />

      {prompts.error === null ? null : (
        <LoadError
          what="prompts"
          message={prompts.error.message}
          onRetry={() => void prompts.refetch()}
        />
      )}

      {listed === undefined ? (
        prompts.error === null ? (
          <ListSkeleton label="Prompts" />
        ) : null
      ) : empty ? (
        <EmptyState
          title={`No ${kindNoun(kind)} prompts yet`}
          actions={<NewPromptButton kind={kind} />}
        >
          {kindSentence(kind)}
        </EmptyState>
      ) : (
        <ListDetail
          className={promptListDetail}
          list={
            listed.length === 0 ? (
              <p className="m-0 py-3 text-small text-ink-2">{`No prompt of any kind has “${query.trim()}” in its name or text.`}</p>
            ) : (
              <SelectionArea selection={selection}>
                <LibraryBulkBar
                  selection={selection}
                  total={listed.length}
                  noun={["prompt", "prompts"]}
                  scope={searching ? `Select all ${String(listed.length)} shown` : undefined}
                  busy={bulk.busy}
                  onDuplicate={() => bulk.duplicate(chosen)}
                  onExport={() => transfer.exportItems(chosen)}
                  onDelete={() => bulk.remove(chosen)}
                />
                <List label="Prompts">
                  {listed.map((prompt) => (
                    <ListRow
                      key={prompt.id}
                      className={promptRow}
                      lead={
                        <RowCheck selection={selection} value={prompt.id} label={prompt.name} />
                      }
                      title={prompt.name}
                      onSelect={() => setSelectedId(prompt.id)}
                      meta={
                        <PromptRowMeta
                          kind={searching ? kindLabel(prompt.kind) : undefined}
                          body={prompt.body}
                          slots={prompt.slots}
                        />
                      }
                      selected={prompt.id === selected?.id}
                      actions={
                        <LibraryRowActions
                          name={prompt.name}
                          edit={
                            <ButtonLink
                              to="/prompts/$promptId"
                              params={{ promptId: prompt.id }}
                              aria-label={`Edit ${prompt.name}`}
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
                              to="/prompts/new"
                              search={{ kind: prompt.kind, from: prompt.id }}
                              aria-label={`Duplicate ${prompt.name}`}
                              variant="quiet"
                              size="small"
                            >
                              Duplicate
                            </ButtonLink>
                          }
                          play={{
                            run: onMakeVideo === undefined ? undefined : () => onMakeVideo(prompt),
                            blocked: makeBlocked,
                          }}
                          onHistory={() => setHistory(prompt)}
                          onDelete={() => setDeleting(prompt)}
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
                item="prompt"
                id={selected.id}
                name={selected.name}
                kicker={`${kindLabel(selected.kind)} prompt`}
                meta={
                  <>
                    Updated <Stamp iso={selected.updatedAt} />
                  </>
                }
                body={selected.body}
                slots={selected.slots}
                actions={
                  <ButtonLink
                    to="/prompts/$promptId"
                    params={{ promptId: selected.id }}
                    size="small"
                  >
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
        <Callout tone="danger" title="The prompt wasn't deleted.">
          {remove.error.message}
        </Callout>
      )}

      {history === undefined ? null : (
        <HistoryDrawer
          key={history.id}
          item="prompt"
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
        confirmLabel="Delete prompt"
        pending={remove.isPending}
        onConfirm={() => {
          if (deleting !== undefined) remove.mutate(deleting.id);
        }}
        onCancel={() => setDeleting(undefined)}
      />
    </PromptsFrame>
  );
}

function NewPromptButton({ kind }: { readonly kind: PromptKind }): ReactElement {
  return (
    <ButtonLink to="/prompts/new" search={{ kind }} variant="primary">
      {`New ${kindNoun(kind)} prompt`}
    </ButtonLink>
  );
}
