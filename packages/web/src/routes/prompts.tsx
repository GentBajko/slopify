import type { Entry, Prompt, PromptKind } from "@app/slices/library/model.js";
import { nameMax } from "@app/slices/library/model.js";
import { useQuery } from "@tanstack/react-query";
import { type ReactElement, useRef } from "react";
import { savePrompt } from "@/api";
import { useApp } from "@/app-context";
import { EmptyState } from "@/components/kit/empty-state";
import { ButtonLink } from "@/components/kit/link";
import { plural } from "@/lib/format";
import { kindAbout, kindLabel, kindNoun, kindSentence } from "@/lib/prompt-kinds";
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
import { keys, promptsQuery } from "@/queries";

// Prompts: every kind down the left with its count, the saved prompts of the one picked (by
// name or last change) beside the selected one's text. A search looks through every kind, the
// intros and outros too, and says each hit's kind. The kind and the selected row live in the
// URL (`?kind=`, `?item=`), so a link opens the same list on the same prompt.
export function PromptsRoute({
  kind,
  onMakeVideo,
  makeBlocked,
}: {
  readonly kind: PromptKind;
  // Opens Create with the prompt (or a search's intro or outro) picked (router.tsx wires the
  // Create draft in).
  readonly onMakeVideo?: ((item: Prompt | Entry) => void) | undefined;
  readonly makeBlocked?: string | undefined;
}) {
  const { api } = useApp();
  const prompts = useQuery(promptsQuery(api));
  const search = usePromptSearch(kind);
  const box = useRef<HTMLInputElement>(null);
  const [sort, setSort] = useLibrarySort("prompt");
  const matches = useMatches(search.needle);

  const all = prompts.data?.prompts ?? [];
  const ofKind = prompts.data?.prompts.filter((prompt) => prompt.kind === kind);
  const rows: readonly Written[] | undefined = search.searching
    ? matches
    : ofKind?.map((item) => ({ type: "prompt", item }));
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
  const empty = ofKind !== undefined && ofKind.length === 0 && !search.searching;

  return (
    <PromptsFrame
      shown={{ kind }}
      search={search}
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
          search.searching
            ? matchTitle(rows?.length ?? 0, search.query)
            : `${kindLabel(kind)} prompts`
        }
        about={search.searching ? searchedEverywhere : empty ? undefined : kindAbout(kind)}
        tools={
          <>
            <PromptSearchBox search={search} input={box} />
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

      {rows === undefined ? (
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
      ) : rows.length === 0 ? null : (
        <WrittenList
          rows={rows}
          sort={sort}
          noun={search.searching ? ["match", "matches"] : ["prompt", "prompts"]}
          searching={search.searching}
          onMakeVideo={onMakeVideo}
          makeBlocked={makeBlocked}
        />
      )}
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
