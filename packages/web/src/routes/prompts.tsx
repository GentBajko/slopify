import type { Prompt, PromptKind } from "@app/slices/library/model.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { removePrompt, savePrompt } from "@/api";
import { useApp } from "@/app-context";
import { Callout } from "@/components/kit/callout";
import { ariaKeyShortcuts, useSearchShortcut } from "@/components/kit/command-palette";
import { ConfirmDialog } from "@/components/kit/dialog";
import { EmptyState } from "@/components/kit/empty-state";
import { Input, Select } from "@/components/kit/field";
import { helpScope, InfoTip } from "@/components/kit/info-tip";
import { ListDetail } from "@/components/kit/layout";
import { ButtonLink } from "@/components/kit/link";
import { List, ListRow } from "@/components/kit/list-row";
import { kindLabel, kindOptions } from "@/lib/prompt-kinds";
import { HistoryDrawer } from "@/library/history-drawer";
import { InlineName, refusedName } from "@/library/inline-name";
import { LibraryItemDetail, plural, updatedOn } from "@/library/item-detail";
import { ListSkeleton, LoadError, libraryListDetail, libraryRow } from "@/library/list-states";
import { LibraryRowActions } from "@/library/row-actions";
import { keys, promptsQuery } from "@/queries";
import { LibraryToolbar } from "@/routes/library";

// Every saved prompt of one kind, sorted by name by the list endpoint, beside the selected
// one's text, what uses it and its latest change. The kind lives in the URL, so switching it
// is handed up to router.tsx instead of reaching for a router here.
export function PromptsRoute({
  kind,
  onKind,
  onUseInPlay,
  playBlocked,
}: {
  readonly kind: PromptKind;
  readonly onKind: (next: PromptKind) => void;
  // Opens Play with the prompt picked (router.tsx wires the Play draft in).
  readonly onUseInPlay?: ((prompt: Prompt) => void) | undefined;
  readonly playBlocked?: string | undefined;
}) {
  const { api } = useApp();
  const queryClient = useQueryClient();
  const prompts = useQuery(promptsQuery(api));
  const [query, setQuery] = useState("");
  const search = useRef<HTMLInputElement>(null);
  const searchKeys = useSearchShortcut(search, "prompts");
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);
  const [deleting, setDeleting] = useState<Prompt | undefined>(undefined);
  const [history, setHistory] = useState<Prompt | undefined>(undefined);

  const remove = useMutation({
    mutationFn: (id: string) => removePrompt(api, id),
    onSettled: async () => {
      setDeleting(undefined);
      await queryClient.invalidateQueries({ queryKey: keys.prompts });
    },
  });

  // A rename from the list: the same save as the editor's, with the text as it is.
  const rename = async (prompt: Prompt, name: string): Promise<string | null> => {
    const reply = await savePrompt(api, { kind: prompt.kind, name, body: prompt.body }, prompt.id);
    await queryClient.invalidateQueries({ queryKey: keys.prompts });
    return reply.ok ? null : refusedName(reply.fields);
  };

  const ofKind = prompts.data?.prompts.filter((prompt) => prompt.kind === kind);
  const needle = query.trim().toLowerCase();
  const listed =
    needle === ""
      ? ofKind
      : ofKind?.filter(
          (prompt) =>
            prompt.name.toLowerCase().includes(needle) ||
            prompt.body.toLowerCase().includes(needle),
        );
  const selected = listed?.find((prompt) => prompt.id === selectedId) ?? listed?.[0];

  return (
    <div>
      <LibraryToolbar action={<NewPromptButton kind={kind} />}>
        <Input
          type="search"
          ref={search}
          aria-label="Search prompts"
          aria-keyshortcuts={ariaKeyShortcuts(searchKeys)}
          placeholder="Search prompts"
          value={query}
          className="w-full min-w-0 sm:w-64"
          onChange={(event) => setQuery(event.target.value)}
        />
        <span className="flex w-full items-center gap-1 sm:w-auto" {...helpScope}>
          <Select
            aria-label="Prompt kind"
            value={kind}
            className="w-full sm:w-56"
            options={kindOptions}
            onChange={(event) => {
              const picked = kindOptions.find((option) => option.value === event.target.value);
              if (picked !== undefined) onKind(picked.value);
            }}
          />
          <InfoTip id="library.prompt.kind" />
        </span>
      </LibraryToolbar>

      {prompts.error === null ? null : (
        <LoadError
          what="prompts"
          message={prompts.error.message}
          onRetry={() => void prompts.refetch()}
        />
      )}

      {listed === undefined || ofKind === undefined ? (
        prompts.error === null ? (
          <ListSkeleton label="Prompts" />
        ) : null
      ) : ofKind.length === 0 ? (
        <EmptyState title={`No ${kindLabel(kind).toLowerCase()} prompts yet`}>
          A prompt is text with {"{{keywords}}"}; each keyword becomes a field on Play.
        </EmptyState>
      ) : (
        <ListDetail
          className={libraryListDetail}
          list={
            listed.length === 0 ? (
              <p className="m-0 py-3 text-small text-ink-2">{`No ${kindLabel(kind).toLowerCase()} prompts match "${query.trim()}".`}</p>
            ) : (
              <List label="Prompts">
                {listed.map((prompt) => (
                  <ListRow
                    key={prompt.id}
                    className={libraryRow}
                    title={
                      <InlineName
                        name={prompt.name}
                        onSelect={() => setSelectedId(prompt.id)}
                        onRename={(name) => rename(prompt, name)}
                      />
                    }
                    meta={promptMeta(prompt)}
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
                          run: onUseInPlay === undefined ? undefined : () => onUseInPlay(prompt),
                          blocked: playBlocked,
                        }}
                        onHistory={() => setHistory(prompt)}
                        onDelete={() => setDeleting(prompt)}
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
                item="prompt"
                id={selected.id}
                name={selected.name}
                kicker={`${kindLabel(selected.kind)} prompt`}
                meta={`Updated ${updatedOn(selected.updatedAt)}`}
                body={selected.body}
                slots={selected.slots}
                actions={
                  <ButtonLink
                    to="/prompts/$promptId"
                    params={{ promptId: selected.id }}
                    size="small"
                  >
                    Edit prompt
                  </ButtonLink>
                }
                onOpenHistory={() => setHistory(selected)}
              />
            )
          }
        />
      )}

      {remove.error === null ? null : (
        <Callout tone="danger" title="The prompt wasn't deleted." className="mt-4">
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
    </div>
  );
}

function promptMeta(prompt: Prompt): string {
  return `${kindLabel(prompt.kind)} · ${plural(prompt.slots.length, "keyword")} · updated ${updatedOn(prompt.updatedAt)}`;
}

function NewPromptButton({ kind }: { readonly kind: PromptKind }) {
  return (
    <ButtonLink to="/prompts/new" search={{ kind }} variant="primary">
      New prompt
    </ButtonLink>
  );
}
