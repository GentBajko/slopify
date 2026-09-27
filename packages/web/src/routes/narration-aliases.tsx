import type { NarrationAlias } from "@app/kernel/ports/narration-aliases.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { type ReactElement, useEffect, useId, useRef, useState } from "react";
import { saveNarrationAliases } from "@/api";
import { useApp } from "@/app-context";
import { ActionBar, StatusSlot, type StatusTone } from "@/components/kit/action-bar";
import { Board, BoardColumn } from "@/components/kit/board";
import { Button, IconButton } from "@/components/kit/button";
import { Callout } from "@/components/kit/callout";
import { EmptyState } from "@/components/kit/empty-state";
import { helpScope, InfoTip } from "@/components/kit/info-tip";
import { List, ListRow } from "@/components/kit/list-row";
import { SectionHead } from "@/components/kit/section-head";
import { Input } from "@/components/ui/input";
import { keys, narrationAliasesQuery } from "@/queries";
import { LibraryToolbar } from "@/routes/library";

interface Row extends NarrationAlias {
  readonly key: number;
}

const blank = { written: "", spoken: "", wholeWord: true, caseSensitive: false };

// Library → Aliases: words the narrator says differently from how they are written ("Dr." as
// "Doctor"). One list, saved as a whole. A project takes a copy when it starts, and only uses
// it while Use narration aliases is on; the article and the captions keep the written words.
export function NarrationAliasesRoute(): ReactElement {
  const { api } = useApp();
  const queryClient = useQueryClient();
  const listing = useQuery(narrationAliasesQuery(api));
  const [rows, setRows] = useState<readonly Row[] | undefined>(undefined);
  const [errors, setErrors] = useState<Readonly<Record<number, string>>>({});
  const [status, setStatus] = useState<{ text: string; tone: StatusTone } | undefined>();
  const next = useRef(0);
  const idPrefix = useId();
  const keyed = (aliases: readonly NarrationAlias[]): readonly Row[] =>
    aliases.map((alias) => {
      next.current += 1;
      return { ...alias, key: next.current };
    });
  // The saved list fills the editor once; after that the editor is the source until Save.
  useEffect(() => {
    if (rows === undefined && listing.data !== undefined) setRows(keyed(listing.data.aliases));
  });
  const shown = rows ?? [];

  const save = useMutation({
    mutationFn: (aliases: readonly NarrationAlias[]) => saveNarrationAliases(api, aliases),
    onSuccess: async (result) => {
      if (!result.ok) {
        const marked: Record<number, string> = {};
        for (const field of result.fields) {
          const index = /^aliases\.(\d+)/u.exec(field.field)?.[1];
          if (index !== undefined) marked[Number(index)] = field.message;
        }
        setErrors(marked);
        setStatus({
          text: `Not saved: ${result.fields.map((field) => field.message).join(" ")}`,
          tone: "error",
        });
        return;
      }
      setErrors({});
      setRows(keyed(result.value.aliases));
      setStatus({
        text: "Saved. New projects use these aliases; a project you already started keeps its copy until you refresh it in Edit project.",
        tone: "success",
      });
      await queryClient.invalidateQueries({ queryKey: keys.narrationAliases });
    },
    onError: (error) =>
      setStatus({ text: `Couldn't save the aliases: ${error.message}`, tone: "error" }),
  });

  const update = (key: number, change: Partial<NarrationAlias>) => {
    setRows(shown.map((row) => (row.key === key ? { ...row, ...change } : row)));
    setStatus(undefined);
  };
  const add = () => {
    next.current += 1;
    setRows([...shown, { ...blank, key: next.current }]);
    setStatus(undefined);
  };
  const remove = (key: number) => {
    setRows(shown.filter((row) => row.key !== key));
    setErrors({});
    setStatus(undefined);
  };

  return (
    <div>
      <LibraryToolbar
        action={
          <Button type="button" onClick={add} disabled={rows === undefined}>
            <PlusIcon aria-hidden="true" className="size-[14px]" />
            Add alias
          </Button>
        }
      >
        <p className="m-0 flex items-center gap-1 text-small text-ink-2">
          Words the narrator says differently, like Dr. as Doctor.
          <InfoTip id="library.aliases" />
        </p>
      </LibraryToolbar>

      {listing.error === null ? null : (
        <Callout tone="danger" title="Couldn't load the aliases" className="mb-6">
          {listing.error.message} Reload the page to try again.
        </Callout>
      )}

      <Board split="aside">
        <BoardColumn label="Aliases">
          {rows === undefined ? null : shown.length === 0 ? (
            <EmptyState title="No aliases yet">
              Use Add alias to say a word differently from how it is written.
            </EmptyState>
          ) : (
            <AliasRows
              rows={shown}
              errors={errors}
              idPrefix={idPrefix}
              update={update}
              remove={remove}
            />
          )}
        </BoardColumn>
        <BoardColumn as="aside" label="How aliases are used">
          <section className="text-small text-ink-2">
            <SectionHead title="How they are used" />
            <p className="m-0 mb-3">
              The narrator reads the alias instead of the written word. The article, the captions
              and the PDF keep the written word.
            </p>
            <p className="m-0 mb-3">
              A project takes a copy of this list when it starts and uses it while Use narration
              aliases is on. A project you already started keeps its copy until you refresh it in
              Edit project.
            </p>
            <p className="m-0">
              Whole word skips matches inside longer words; Match case only matches the exact
              capitals.
            </p>
          </section>
        </BoardColumn>
      </Board>

      <ActionBar status={<StatusSlot tone={status?.tone ?? "info"}>{status?.text}</StatusSlot>}>
        <Button
          type="button"
          variant="primary"
          disabled={rows === undefined || save.isPending}
          onClick={() =>
            save.mutate(
              shown.map(({ written, spoken, wholeWord, caseSensitive }) => ({
                written,
                spoken,
                wholeWord,
                caseSensitive,
              })),
            )
          }
        >
          {save.isPending ? "Saving…" : "Save aliases"}
        </Button>
      </ActionBar>
    </div>
  );
}

// The editable rows, as hairline-separated rows on the page rather than a box.
function AliasRows({
  rows: shown,
  errors,
  idPrefix,
  update,
  remove,
}: {
  readonly rows: readonly Row[];
  readonly errors: Readonly<Record<number, string>>;
  readonly idPrefix: string;
  readonly update: (key: number, change: Partial<NarrationAlias>) => void;
  readonly remove: (key: number) => void;
}): ReactElement {
  return (
    // One info button per column, once above the rows rather than on every row.
    <div {...helpScope}>
      <p className="m-0 flex flex-wrap items-center gap-x-4 gap-y-1 pb-2 text-small text-ink-2">
        <span className="flex items-center gap-1">
          Written
          <InfoTip id="library.aliases.written" />
        </span>
        <span className="flex items-center gap-1">
          Say it as
          <InfoTip id="library.aliases.spoken" />
        </span>
        <span className="flex items-center gap-1">
          Whole word
          <InfoTip id="library.aliases.whole-word" />
        </span>
        <span className="flex items-center gap-1">
          Match case
          <InfoTip id="library.aliases.match-case" />
        </span>
      </p>
      <List label="Narration aliases">
        {shown.map((row, index) => {
          const id = `${idPrefix}-${row.key}`;
          const error = errors[index];
          const written = row.written.trim();
          const spoken = row.spoken.trim();
          return (
            <ListRow
              key={row.key}
              title={`Alias ${String(index + 1)}`}
              meta={
                written === "" || spoken === ""
                  ? "Not filled in yet"
                  : `Says ${written} as ${spoken}${row.wholeWord ? " · whole word" : ""}${
                      row.caseSensitive ? " · match case" : ""
                    }`
              }
              actions={
                <IconButton
                  size="small"
                  label={`Remove alias ${String(index + 1)}`}
                  onClick={() => remove(row.key)}
                >
                  <Trash2Icon aria-hidden="true" />
                </IconButton>
              }
            >
              {/* Every alias is edited in place: the list is saved as a whole. */}
              <div className="grid grid-cols-1 gap-x-4 gap-y-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto] md:items-end">
                <label className="grid gap-1 text-label text-ink-2" htmlFor={`${id}-written`}>
                  Written
                  <Input
                    id={`${id}-written`}
                    value={row.written}
                    placeholder="Dr."
                    maxLength={200}
                    aria-invalid={error !== undefined}
                    aria-describedby={error === undefined ? undefined : `${id}-error`}
                    onChange={(event) => update(row.key, { written: event.target.value })}
                  />
                </label>
                <label className="grid gap-1 text-label text-ink-2" htmlFor={`${id}-spoken`}>
                  Say it as
                  <Input
                    id={`${id}-spoken`}
                    value={row.spoken}
                    placeholder="Doctor"
                    maxLength={500}
                    aria-invalid={error !== undefined}
                    onChange={(event) => update(row.key, { spoken: event.target.value })}
                  />
                </label>
                <label className="flex min-h-8 items-center gap-2 text-small max-[1099px]:min-h-11">
                  <input
                    type="checkbox"
                    className="size-4 accent-accent"
                    checked={row.wholeWord}
                    onChange={(event) => update(row.key, { wholeWord: event.target.checked })}
                  />
                  Whole word
                </label>
                <label className="flex min-h-8 items-center gap-2 text-small max-[1099px]:min-h-11">
                  <input
                    type="checkbox"
                    className="size-4 accent-accent"
                    checked={row.caseSensitive}
                    onChange={(event) => update(row.key, { caseSensitive: event.target.checked })}
                  />
                  Match case
                </label>
                {error === undefined ? null : (
                  <p id={`${id}-error`} className="m-0 text-small text-danger md:col-span-4">
                    {error}
                  </p>
                )}
              </div>
            </ListRow>
          );
        })}
      </List>
    </div>
  );
}
