import { type Entry, nameMax, type Prompt } from "@app/slices/library/model.js";
import { libraryFile } from "@app/slices/library/transfer.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { type ReactElement, type RefObject, useState } from "react";
import { removeEntry, removePrompt, saveEntry, savePrompt } from "@/api";
import { useApp } from "@/app-context";
import { Callout } from "@/components/kit/callout";
import { ariaKeyShortcuts, useSearchShortcut } from "@/components/kit/command-palette";
import { ConfirmDialog } from "@/components/kit/dialog";
import { Input } from "@/components/kit/field";
import { ListDetail } from "@/components/kit/layout";
import { ButtonLink } from "@/components/kit/link";
import { List, ListRow } from "@/components/kit/list-row";
import { useToast } from "@/components/kit/toast";
import { counted, RowCheck, useSelection } from "@/components/selection";
import { categoryLabel, modeLabel } from "@/lib/entry-options";
import { plural } from "@/lib/format";
import { kindLabel } from "@/lib/prompt-kinds";
import { entriesQuery, keys, promptsQuery } from "@/queries";
import { trashKey } from "@/trash/api";
import { LibraryBulkBar, SelectionArea } from "./bulk-bar";
import { HistoryDrawer } from "./history-drawer";
import { LibraryItemDetail } from "./item-detail";
import { promptListDetail, promptRow } from "./list-states";
import { useLibraryItem } from "./list-url";
import { hasWords, PromptRowMeta } from "./prompts-frame";
import { DuplicateLabel, LibraryRowActions } from "./row-actions";
import { type LibrarySort, sortLibrary } from "./sort";
import { Stamp } from "./time";
import { downloadLibraryFile } from "./transfer-file";
import { refusalOf, useLibraryBulk } from "./use-library-bulk";

// One text of the Prompts page: a prompt of any kind, or an intro or outro (saved apart from
// prompts, with a category instead of a kind). One kind's list holds one sort; a search holds
// both, so every row, its detail, its Versions and its Delete know which one they hold.
export type Written =
  | { readonly type: "prompt"; readonly item: Prompt }
  | { readonly type: "entry"; readonly item: Entry };

const entriesNoun = ["intro or outro", "intros and outros"] as const;

const keyOf = (one: Written): string => `${one.type}:${one.item.id}`;

// The words in the Prompts page's search box. They belong to the list they were typed on:
// picking another kind, or the same one again in the list of kinds, clears them.
export interface PromptSearch {
  readonly query: string;
  readonly needle: string;
  readonly searching: boolean;
  readonly type: (text: string) => void;
  readonly clear: () => void;
}

export function usePromptSearch(scope: string): PromptSearch {
  const [typed, setTyped] = useState({ scope, text: "" });
  const query = typed.scope === scope ? typed.text : "";
  const needle = query.trim().toLowerCase();
  return {
    query,
    needle,
    searching: needle !== "",
    type: (text) => setTyped({ scope, text }),
    clear: () => setTyped({ scope, text: "" }),
  };
}

// Every prompt, intro and outro with the words, once both lists are read. A list that could not
// be read adds nothing (its error is said above the list), rather than holding the search back.
export function useMatches(needle: string): readonly Written[] | undefined {
  const { api } = useApp();
  const prompts = useQuery(promptsQuery(api));
  const entries = useQuery(entriesQuery(api));
  const promptRows = prompts.data?.prompts ?? (prompts.error === null ? undefined : []);
  const entryRows = entries.data?.entries ?? (entries.error === null ? undefined : []);
  if (promptRows === undefined || entryRows === undefined) return undefined;
  return [
    ...promptRows
      .filter((item) => hasWords(item, needle))
      .map((item) => ({ type: "prompt" as const, item })),
    ...entryRows
      .filter((item) => hasWords(item, needle))
      .map((item) => ({ type: "entry" as const, item })),
  ];
}

// The head's title while searching: "3 matches for “calm”", "No matches for “welcome”".
export function matchTitle(count: number, query: string): string {
  const words = `“${query.trim()}”`;
  return count === 0
    ? `No matches for ${words}`
    : `${plural(count, "match", "matches")} for ${words}`;
}

export const searchedEverywhere = "Searched every kind, intros and outros too.";

// The one search box of Prompts and of Intros and Outros, over every kind of both.
export function PromptSearchBox({
  search,
  input,
}: {
  readonly search: PromptSearch;
  readonly input: RefObject<HTMLInputElement | null>;
}): ReactElement {
  const shortcut = useSearchShortcut(input, "prompts, intros and outros");
  return (
    <Input
      type="search"
      ref={input}
      aria-label="Search prompts, intros and outros"
      aria-keyshortcuts={ariaKeyShortcuts(shortcut)}
      placeholder="Search all prompts"
      value={search.query}
      className="w-full min-w-0 sm:w-56"
      onChange={(event) => search.type(event.target.value)}
    />
  );
}

// The list beside the selected text: one kind's prompts, the intros or the outros, or what a
// search found in all of them. Above it, a one-line selection bar the width of the list and the
// detail together, so ticking a box never moves a row; each row's Edit and Make a video, with
// Duplicate, Versions and Delete behind More; the selected row's text, keywords, versions and
// users beside it.
export function WrittenList({
  rows,
  sort,
  noun,
  entryNoun = entriesNoun,
  searching,
  onMakeVideo,
  makeBlocked,
}: {
  readonly rows: readonly Written[];
  readonly sort: LibrarySort;
  // What the selection bar counts: prompts, intros, outros or matches.
  readonly noun: readonly [singular: string, plural: string];
  // What a bulk action's message calls the intros and outros it did.
  readonly entryNoun?: readonly [singular: string, plural: string] | undefined;
  // A search's rows lead with their kind, and Select all says it takes only those shown.
  readonly searching: boolean;
  // Opens Create with the prompt or intro/outro picked (router.tsx wires the Create draft in).
  readonly onMakeVideo?: ((item: Prompt | Entry) => void) | undefined;
  readonly makeBlocked?: string | undefined;
}): ReactElement {
  const { api } = useApp();
  const queryClient = useQueryClient();
  const notify = useToast();
  const allPrompts = useQuery(promptsQuery(api)).data?.prompts ?? [];
  const allEntries = useQuery(entriesQuery(api)).data?.entries ?? [];
  const [selectedId, setSelectedId] = useLibraryItem();
  const [deleting, setDeleting] = useState<Written | undefined>(undefined);
  const [versions, setVersions] = useState<Written | undefined>(undefined);

  const listed = sortLibrary(
    rows.map((one) => ({ name: one.item.name, updatedAt: one.item.updatedAt, one })),
    sort,
  ).map((row) => row.one);
  const selected = listed.find((one) => one.item.id === selectedId) ?? listed[0];
  const selection = useSelection(listed.map(keyOf));
  const chosen = listed.filter((one) => selection.has(keyOf(one)));
  const chosenPrompts = chosen.flatMap((one) => (one.type === "prompt" ? [one.item] : []));
  const chosenEntries = chosen.flatMap((one) => (one.type === "entry" ? [one.item] : []));

  const promptBulk = useLibraryBulk({
    noun: ["prompt", "prompts"],
    listKey: keys.prompts,
    all: allPrompts,
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
  const entryBulk = useLibraryBulk({
    noun: entryNoun,
    listKey: keys.entries,
    all: allEntries,
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
  const busy = promptBulk.busy || entryBulk.busy;
  const exportChosen = (): void => {
    downloadLibraryFile(
      chosenPrompts.length > 0 ? "prompts" : "intros-and-outros",
      libraryFile(
        {
          ...(chosenPrompts.length === 0 ? {} : { prompts: chosenPrompts }),
          ...(chosenEntries.length === 0 ? {} : { entries: chosenEntries }),
        },
        new Date(),
      ),
    );
    notify(`Exported ${counted(chosen.length, noun[0], noun[1])}.`, "success");
  };

  const remove = useMutation({
    mutationFn: (one: Written) =>
      one.type === "prompt" ? removePrompt(api, one.item.id) : removeEntry(api, one.item.id),
    onSettled: async () => {
      setDeleting(undefined);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.prompts }),
        queryClient.invalidateQueries({ queryKey: keys.entries }),
        queryClient.invalidateQueries({ queryKey: trashKey }),
      ]);
    },
  });

  return (
    <>
      <SelectionArea selection={selection}>
        <LibraryBulkBar
          selection={selection}
          total={listed.length}
          noun={noun}
          scope={searching ? `Select all ${String(listed.length)} shown` : undefined}
          busy={busy}
          onDuplicate={() => {
            if (chosenPrompts.length > 0) promptBulk.duplicate(chosenPrompts);
            if (chosenEntries.length > 0) entryBulk.duplicate(chosenEntries);
          }}
          onExport={exportChosen}
          onDelete={() => {
            if (chosenPrompts.length > 0) promptBulk.remove(chosenPrompts);
            if (chosenEntries.length > 0) entryBulk.remove(chosenEntries);
          }}
        />
        <ListDetail
          className={promptListDetail}
          list={
            <List label={noun[1].charAt(0).toUpperCase() + noun[1].slice(1)}>
              {listed.map((one) => (
                <ListRow
                  key={keyOf(one)}
                  className={promptRow}
                  lead={<RowCheck selection={selection} value={keyOf(one)} label={one.item.name} />}
                  title={one.item.name}
                  onSelect={() => setSelectedId(one.item.id)}
                  meta={
                    <PromptRowMeta
                      kind={searching ? kindName(one) : undefined}
                      body={one.item.body}
                      slots={one.item.slots}
                    />
                  }
                  selected={selected !== undefined && keyOf(one) === keyOf(selected)}
                  actions={
                    <LibraryRowActions
                      name={one.item.name}
                      edit={<EditLink one={one} label={`Edit ${one.item.name}`} quiet />}
                      // The copy is named "<name> copy" and opened for editing, so a name
                      // that is already taken is renamed before it is ever saved.
                      duplicate={duplicateLink(one)}
                      play={{
                        run: onMakeVideo === undefined ? undefined : () => onMakeVideo(one.item),
                        blocked: makeBlocked,
                      }}
                      onVersions={() => setVersions(one)}
                      onDelete={() => setDeleting(one)}
                    />
                  }
                />
              ))}
            </List>
          }
          detail={
            selected === undefined ? null : (
              <LibraryItemDetail
                key={keyOf(selected)}
                item={selected.type}
                id={selected.item.id}
                name={selected.item.name}
                meta={
                  <>
                    {detailLead(selected, searching)}
                    Updated <Stamp iso={selected.item.updatedAt} />
                  </>
                }
                body={selected.item.body}
                slots={selected.item.slots}
                actions={<EditLink one={selected} label="Edit" />}
                onOpenHistory={() => setVersions(selected)}
              />
            )
          }
        />
      </SelectionArea>

      {remove.error === null ? null : (
        <Callout tone="danger" title={`The ${nounOf(remove.variables)} wasn't deleted.`}>
          {remove.error.message}
        </Callout>
      )}

      {versions === undefined ? null : (
        <HistoryDrawer
          key={keyOf(versions)}
          item={versions.type}
          id={versions.item.id}
          name={versions.item.name}
          onClose={() => setVersions(undefined)}
        />
      )}

      <ConfirmDialog
        open={deleting !== undefined}
        title={deleting === undefined ? "" : `Delete "${deleting.item.name}"?`}
        // A project holds its own rendered text, so nothing it made is touched. It goes on
        // showing the name it was run with, marked "(deleted)".
        consequence="Moves it to the trash for 30 days (Settings → Trash). Projects that used it keep their text."
        confirmLabel={`Delete ${nounOf(deleting)}`}
        pending={remove.isPending}
        onConfirm={() => {
          if (deleting !== undefined) remove.mutate(deleting);
        }}
        onCancel={() => setDeleting(undefined)}
      />
    </>
  );
}

// "Article", "Intro": what a search's row leads with.
function kindName(one: Written): string {
  return one.type === "prompt" ? kindLabel(one.item.kind) : categoryLabel(one.item.category);
}

// "prompt", "intro", "outro": what a delete names.
function nounOf(one: Written | undefined): string {
  return one === undefined || one.type === "prompt" ? "prompt" : one.item.category;
}

// The start of the detail's line: an intro or outro's way of being read ("Say these exact
// words"), and in a search, which kind it is, since no list head names it there.
function detailLead(one: Written, searching: boolean): string {
  const kind = searching
    ? one.type === "prompt"
      ? `${kindLabel(one.item.kind)} prompt · `
      : `${categoryLabel(one.item.category)} · `
    : "";
  return one.type === "prompt" ? kind : `${kind}${modeLabel(one.item.mode)} · `;
}

function EditLink({
  one,
  label,
  quiet = false,
}: {
  readonly one: Written;
  readonly label: string;
  readonly quiet?: boolean;
}): ReactElement {
  const look = quiet
    ? ({ variant: "quiet", size: "small" } as const)
    : ({ size: "small" } as const);
  return one.type === "prompt" ? (
    <ButtonLink
      to="/prompts/$promptId"
      params={{ promptId: one.item.id }}
      aria-label={label}
      {...look}
    >
      Edit
    </ButtonLink>
  ) : (
    <ButtonLink
      to="/entries/$entryId"
      params={{ entryId: one.item.id }}
      aria-label={label}
      {...look}
    >
      Edit
    </ButtonLink>
  );
}

// The link itself, not a component around it: the menu item it goes in hands its role and
// handlers to the element it is given.
function duplicateLink(one: Written): ReactElement {
  const label = `Duplicate ${one.item.name}`;
  return one.type === "prompt" ? (
    <Link
      to="/prompts/new"
      search={{ kind: one.item.kind, from: one.item.id }}
      aria-label={label}
      className="no-underline"
    >
      <DuplicateLabel />
    </Link>
  ) : (
    <Link
      to="/entries/new"
      search={{ category: one.item.category, from: one.item.id }}
      aria-label={label}
      className="no-underline"
    >
      <DuplicateLabel />
    </Link>
  );
}
