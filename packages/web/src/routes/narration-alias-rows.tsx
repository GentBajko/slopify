import type { NarrationAlias } from "@app/kernel/ports/narration-aliases.js";
import { Trash2Icon } from "lucide-react";
import type { ReactElement } from "react";
import { IconButton } from "@/components/kit/button";
import { helpScope, InfoTip } from "@/components/kit/info-tip";
import { List, ListRow } from "@/components/kit/list-row";
import { RowCheck, type Selection } from "@/components/selection";
import { Input } from "@/components/ui/input";

export interface AliasRow extends NarrationAlias {
  readonly key: number;
}

// A row with its place in the whole list, so "Alias 3" and the server's errors keep their
// numbers while a search hides the rows around it.
export interface PlacedRow {
  readonly row: AliasRow;
  readonly index: number;
}

// The editable rows, as hairline-separated rows on the page rather than a box.
export function AliasRows({
  rows,
  errors,
  idPrefix,
  update,
  remove,
  selection,
}: {
  readonly rows: readonly PlacedRow[];
  readonly errors: Readonly<Record<number, string>>;
  readonly idPrefix: string;
  readonly update: (key: number, change: Partial<NarrationAlias>) => void;
  readonly remove: (key: number) => void;
  // Ticked rows by their key, for Remove selected and Export selected.
  readonly selection: Selection<string>;
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
        {rows.map(({ row, index }) => {
          const id = `${idPrefix}-${row.key}`;
          const error = errors[index];
          const written = row.written.trim();
          const spoken = row.spoken.trim();
          return (
            <ListRow
              key={row.key}
              lead={
                <RowCheck
                  selection={selection}
                  value={String(row.key)}
                  label={`Alias ${String(index + 1)}${written === "" ? "" : ` (${written})`}`}
                />
              }
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

// The rows a search keeps: the written or spoken form contains every typed word.
export function matchingRows(rows: readonly AliasRow[], query: string): readonly PlacedRow[] {
  const words = query.trim().toLowerCase().split(/\s+/u).filter(Boolean);
  const placed = rows.map((row, index) => ({ row, index }));
  if (words.length === 0) return placed;
  return placed.filter(({ row }) => {
    const text = `${row.written} ${row.spoken}`.toLowerCase();
    return words.every((word) => text.includes(word));
  });
}
