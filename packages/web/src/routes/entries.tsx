import { type Entry, type EntryCategory, nameMax, type Prompt } from "@app/slices/library/model.js";
import { useQuery } from "@tanstack/react-query";
import { type ReactElement, useRef } from "react";
import { saveEntry } from "@/api";
import { useApp } from "@/app-context";
import { EmptyState } from "@/components/kit/empty-state";
import { ButtonLink } from "@/components/kit/link";
import { categoryAbout, categoryLabel } from "@/lib/entry-options";
import { plural } from "@/lib/format";
import { ListSkeleton, LoadError } from "@/library/list-states";
import {
  matchTitle,
  PromptSearchBox,
  searchedEverywhere,
  useMatches,
  usePromptSearch,
  type Written,
  WrittenList,
} from "@/library/prompt-list";
import { PromptsFrame, PromptsListHead } from "@/library/prompts-frame";
import { useLibrarySort } from "@/library/sort";
import { SortMenu } from "@/library/sort-menu";
import { TransferMenu } from "@/library/transfer-menu";
import { useLibraryTransfer } from "@/library/use-library-transfer";
import { entriesQuery, keys } from "@/queries";

// Prompts → Intros or Outros: the saved intros (or outros), by name or last change, beside the
// selected one's words. They sit in the Prompts page's list of kinds, and its one search box
// looks through every kind of prompt and the intros and outros both. The category and the
// selected row live in the URL, the same division Prompts makes.
export function EntriesRoute({
  category,
  onMakeVideo,
  makeBlocked,
}: {
  readonly category: EntryCategory;
  // Opens Create with the intro or outro (or a search's prompt) picked (router.tsx wires the
  // Create draft in).
  readonly onMakeVideo?: ((item: Prompt | Entry) => void) | undefined;
  readonly makeBlocked?: string | undefined;
}) {
  const { api } = useApp();
  const entries = useQuery(entriesQuery(api));
  const search = usePromptSearch(category);
  const box = useRef<HTMLInputElement>(null);
  const [sort, setSort] = useLibrarySort("entry");
  const matches = useMatches(search.needle);

  const all = entries.data?.entries ?? [];
  const ofCategory = entries.data?.entries.filter((entry) => entry.category === category);
  const rows: readonly Written[] | undefined = search.searching
    ? matches
    : ofCategory?.map((item) => ({ type: "entry", item }));
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
  const empty = ofCategory !== undefined && ofCategory.length === 0 && !search.searching;

  return (
    <PromptsFrame
      shown={{ category }}
      search={search}
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
          search.searching
            ? matchTitle(rows?.length ?? 0, search.query)
            : `${categoryLabel(category)}s`
        }
        about={search.searching ? searchedEverywhere : empty ? undefined : categoryAbout(category)}
        tools={
          <>
            <PromptSearchBox search={search} input={box} />
            {/* Nothing to order in an empty list. */}
            {empty ? null : <SortMenu what="intros and outros" sort={sort} onSort={setSort} />}
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

      {rows === undefined ? (
        entries.error === null ? (
          <ListSkeleton label="Intros and outros" />
        ) : null
      ) : empty ? (
        <EmptyState title={`No ${category}s yet`} actions={<NewEntryButton category={category} />}>
          {categoryAbout(category)}
        </EmptyState>
      ) : rows.length === 0 ? null : (
        <WrittenList
          rows={rows}
          sort={sort}
          noun={search.searching ? ["match", "matches"] : [category, `${category}s`]}
          entryNoun={search.searching ? undefined : [category, `${category}s`]}
          searching={search.searching}
          onMakeVideo={onMakeVideo}
          makeBlocked={makeBlocked}
        />
      )}
    </PromptsFrame>
  );
}

function NewEntryButton({ category }: { readonly category: EntryCategory }): ReactElement {
  return (
    <ButtonLink to="/entries/new" search={{ category }} variant="primary">
      {`New ${category}`}
    </ButtonLink>
  );
}
