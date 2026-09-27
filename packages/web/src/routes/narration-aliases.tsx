import type { NarrationAlias } from "@app/kernel/ports/narration-aliases.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PlusIcon } from "lucide-react";
import { type ReactElement, useEffect, useId, useRef, useState } from "react";
import { saveNarrationAliases } from "@/api";
import { useApp } from "@/app-context";
import { ActionBar, StatusSlot, type StatusTone } from "@/components/kit/action-bar";
import { Button } from "@/components/kit/button";
import { helpScope, InfoTip } from "@/components/kit/info-tip";
import { RailGroup } from "@/components/rail";
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
        <RailGroup>
          <p className="px-4 py-[14px] text-body text-danger">
            Couldn't load the aliases: {listing.error.message} Reload the page to try again.
          </p>
        </RailGroup>
      )}

      {rows === undefined ? null : shown.length === 0 ? (
        <RailGroup>
          <p className="px-4 py-[14px] text-body text-ink-2">
            No aliases yet. Use Add alias to say a word differently from how it is written.
          </p>
        </RailGroup>
      ) : (
        <RailGroup>
          {/* One info button per column, once above the rows rather than on every row. */}
          <div {...helpScope}>
            <p className="m-0 flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line px-4 py-2 text-small text-ink-2">
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
            <ul aria-label="Narration aliases">
              {shown.map((row, index) => {
                const id = `${idPrefix}-${row.key}`;
                const error = errors[index];
                return (
                  <li
                    key={row.key}
                    className="grid grid-cols-1 gap-x-[14px] gap-y-2 border-b border-line px-4 py-[10px] last:border-b-0 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto_auto] md:items-end"
                  >
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
                        onChange={(event) =>
                          update(row.key, { caseSensitive: event.target.checked })
                        }
                      />
                      Match case
                    </label>
                    <Button
                      type="button"
                      variant="quiet"
                      aria-label={`Remove alias ${index + 1}`}
                      onClick={() => remove(row.key)}
                    >
                      Remove
                    </Button>
                    {error === undefined ? null : (
                      <p id={`${id}-error`} className="m-0 text-small text-danger md:col-span-5">
                        {error}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </RailGroup>
      )}

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
