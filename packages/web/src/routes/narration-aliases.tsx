import type { NarrationAlias } from "@app/kernel/ports/narration-aliases.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardPasteIcon, PlusIcon } from "lucide-react";
import { type ReactElement, useEffect, useId, useRef, useState } from "react";
import { saveNarrationAliases } from "@/api";
import { useApp } from "@/app-context";
import { ActionBar, StatusSlot, type StatusTone } from "@/components/kit/action-bar";
import { Board, BoardColumn } from "@/components/kit/board";
import { Button } from "@/components/kit/button";
import { Callout } from "@/components/kit/callout";
import { EmptyState } from "@/components/kit/empty-state";
import { Input } from "@/components/kit/field";
import { InfoTip } from "@/components/kit/info-tip";
import { SectionHead } from "@/components/kit/section-head";
import { useToast } from "@/components/kit/toast";
import { counted, useSelection } from "@/components/selection";
import { LibraryBulkBar, SelectionArea } from "@/library/bulk-bar";
import { TransferMenu } from "@/library/transfer-menu";
import { keys, narrationAliasesQuery } from "@/queries";
import { LibraryToolbar } from "@/routes/library";
import { mergeAliases, PasteAliasesDialog } from "./narration-alias-paste.js";
import { type AliasRow, AliasRows, matchingRows } from "./narration-alias-rows.js";
import { aliasFileTypes, useAliasTransfer } from "./narration-alias-transfer.js";
import { UnsavedLeaveGuard } from "./unsaved-leave-guard.js";

const blank = { written: "", spoken: "", wholeWord: true, caseSensitive: false };

const plain = (rows: readonly AliasRow[]): readonly NarrationAlias[] =>
  rows.map(({ written, spoken, wholeWord, caseSensitive }) => ({
    written,
    spoken,
    wholeWord,
    caseSensitive,
  }));

// Library → Aliases: words the narrator says differently from how they are written ("Dr." as
// "Doctor"). One list, saved as a whole. A project takes a copy when it starts, and only uses
// it while Use narration aliases is on; the article and the captions keep the written words.
export function NarrationAliasesRoute(): ReactElement {
  const { api } = useApp();
  const queryClient = useQueryClient();
  const notify = useToast();
  const listing = useQuery(narrationAliasesQuery(api));
  const [rows, setRows] = useState<readonly AliasRow[] | undefined>(undefined);
  // What Save last kept (or the load), to tell whether the list on screen has unsaved changes.
  const [saved, setSaved] = useState<string | undefined>(undefined);
  const [errors, setErrors] = useState<Readonly<Record<number, string>>>({});
  const [status, setStatus] = useState<{ text: string; tone: StatusTone } | undefined>();
  const [query, setQuery] = useState("");
  const [pasting, setPasting] = useState(false);
  const [focusKey, setFocusKey] = useState<number | undefined>(undefined);
  const next = useRef(0);
  const idPrefix = useId();
  const keyed = (aliases: readonly NarrationAlias[]): readonly AliasRow[] =>
    aliases.map((alias) => {
      next.current += 1;
      return { ...alias, key: next.current };
    });
  // The saved list fills the editor once; after that the editor is the source until Save.
  useEffect(() => {
    if (rows === undefined && listing.data !== undefined) {
      setRows(keyed(listing.data.aliases));
      setSaved(JSON.stringify(listing.data.aliases));
    }
  });
  const shown = rows ?? [];
  const dirty = rows !== undefined && saved !== JSON.stringify(plain(shown));

  // A row just added gets the cursor in its Written field, scrolled into view.
  useEffect(() => {
    if (focusKey === undefined) return;
    const field = document.getElementById(`${idPrefix}-${String(focusKey)}-written`);
    if (field === null) return;
    field.focus();
    if (typeof field.scrollIntoView === "function") field.scrollIntoView({ block: "center" });
    setFocusKey(undefined);
  }, [focusKey, idPrefix]);

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
      setSaved(JSON.stringify(result.value.aliases));
      setStatus({
        text: "Saved. New projects use these aliases; a project you already started keeps its copy until you refresh it in Edit project.",
        tone: "success",
      });
      await queryClient.invalidateQueries({ queryKey: keys.narrationAliases });
    },
    onError: (error) =>
      setStatus({
        text: `Couldn't save the aliases: ${error.message} Your changes are still on screen; press Save aliases to try again.`,
        tone: "error",
      }),
  });

  const update = (key: number, change: Partial<NarrationAlias>) => {
    setRows(shown.map((row) => (row.key === key ? { ...row, ...change } : row)));
    setStatus(undefined);
  };
  const add = () => {
    next.current += 1;
    const key = next.current;
    setRows([...shown, { ...blank, key }]);
    // The new row is blank, so a search would hide it.
    setQuery("");
    setFocusKey(key);
    setStatus(undefined);
  };
  const remove = (key: number) => {
    const at = shown.findIndex((row) => row.key === key);
    const removed = shown[at];
    if (removed === undefined) return;
    setRows(shown.filter((row) => row.key !== key));
    setErrors({});
    setStatus(undefined);
    const name = removed.written.trim();
    notify(
      name === ""
        ? `Removed alias ${String(at + 1)}. Press Save aliases to keep the change.`
        : `Removed the alias for “${name}”. Press Save aliases to keep the change.`,
      "info",
      {
        label: "Undo",
        run: () =>
          setRows((current) => {
            const list = [...(current ?? [])];
            list.splice(Math.min(at, list.length), 0, removed);
            return list;
          }),
      },
    );
  };
  const addPasted = (aliases: readonly NarrationAlias[]) => {
    const merged = mergeAliases(shown, aliases, (alias) => {
      next.current += 1;
      return { ...alias, key: next.current };
    });
    setRows(merged.rows);
    setQuery("");
    setStatus({
      text: `Added ${String(merged.added)} and updated ${String(merged.updated)} from the pasted lines. Press Save aliases to keep them.`,
      tone: "info",
    });
  };
  const visible = matchingRows(shown, query);
  const selection = useSelection(visible.map(({ row }) => String(row.key)));
  const chosen = shown.filter((row) => selection.has(String(row.key)));
  // Remove selected: the rows leave the list on screen; Undo puts each back where it was.
  const removeChosen = () => {
    const gone = shown.flatMap((row, at) => (selection.has(String(row.key)) ? [{ row, at }] : []));
    if (gone.length === 0) return;
    setRows(shown.filter((row) => !selection.has(String(row.key))));
    selection.clear();
    setErrors({});
    setStatus(undefined);
    notify(
      `Removed ${counted(gone.length, "alias", "aliases")}. Press Save aliases to keep the change.`,
      "info",
      {
        label: "Undo",
        run: () =>
          setRows((current) => {
            const list = [...(current ?? [])];
            for (const { row, at } of gone) list.splice(Math.min(at, list.length), 0, row);
            return list;
          }),
      },
    );
  };
  const transfer = useAliasTransfer({
    onImport: (aliases) => {
      const merged = mergeAliases(shown, aliases, (alias) => {
        next.current += 1;
        return { ...alias, key: next.current };
      });
      setRows(merged.rows);
      setQuery("");
      setStatus(undefined);
      return merged;
    },
  });

  return (
    <div>
      <LibraryToolbar
        action={
          <>
            <TransferMenu
              what="aliases"
              disabled={rows === undefined}
              exports={[
                {
                  label: `Export all ${counted(shown.length, "alias", "aliases")}`,
                  run: () => transfer.exportJson(plain(shown)),
                  disabled: shown.length === 0,
                },
                {
                  label: "Export all as CSV",
                  run: () => transfer.exportCsv(plain(shown)),
                  disabled: shown.length === 0,
                },
              ]}
              accept={aliasFileTypes}
              onFile={(file) => void transfer.importFile(file)}
            />
            <Button type="button" onClick={() => setPasting(true)} disabled={rows === undefined}>
              <ClipboardPasteIcon aria-hidden="true" className="size-[14px]" />
              Paste many
            </Button>
            <Button type="button" onClick={add} disabled={rows === undefined}>
              <PlusIcon aria-hidden="true" className="size-[14px]" />
              Add alias
            </Button>
          </>
        }
      >
        <Input
          type="search"
          aria-label="Search aliases"
          placeholder="Search aliases"
          value={query}
          className="w-full min-w-0 sm:w-64"
          onChange={(event) => setQuery(event.target.value)}
        />
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
              Use Add alias to say a word differently from how it is written, or Paste many to add a
              list.
            </EmptyState>
          ) : visible.length === 0 ? (
            <EmptyState title="No alias matches">
              {`Nothing in the ${String(shown.length)} aliases contains “${query.trim()}”. Clear the search to see them all.`}
            </EmptyState>
          ) : (
            <SelectionArea selection={selection}>
              <LibraryBulkBar
                selection={selection}
                total={visible.length}
                noun={["alias", "aliases"]}
                scope={
                  visible.length === shown.length
                    ? undefined
                    : `Select all ${String(visible.length)} shown`
                }
                busy={false}
                onExport={() => transfer.exportJson(plain(chosen))}
                onDelete={removeChosen}
                deleteLabel="Remove selected"
              />
              <AliasRows
                rows={visible}
                errors={errors}
                idPrefix={idPrefix}
                update={update}
                remove={remove}
                selection={selection}
              />
            </SelectionArea>
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

      <PasteAliasesDialog open={pasting} onClose={() => setPasting(false)} onAdd={addPasted} />
      <UnsavedLeaveGuard dirty={dirty} what="your alias changes" saveLabel="Save aliases" />

      <ActionBar
        status={
          <StatusSlot tone={status?.tone ?? (dirty ? "warning" : "info")}>
            {status?.text ?? (dirty ? "Unsaved changes. Press Save aliases to keep them." : "")}
          </StatusSlot>
        }
      >
        <Button
          type="button"
          variant="primary"
          disabled={rows === undefined || save.isPending}
          onClick={() => save.mutate(plain(shown))}
        >
          {save.isPending ? "Saving…" : "Save aliases"}
        </Button>
      </ActionBar>
    </div>
  );
}
