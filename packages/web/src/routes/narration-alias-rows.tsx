import type { NarrationAlias } from "@app/kernel/ports/narration-aliases.js";
import type { ReactElement } from "react";
import { Button } from "@/components/kit/button";
import { Checkbox, HelpLine } from "@/components/kit/field";
import { helpScope } from "@/components/kit/info-tip";
import { List } from "@/components/kit/list-row";
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

// The editable rows, one line each from a tablet up: the row's tick and number, what is written,
// what to say instead, its two ticks and Remove, under one line naming the columns. On a phone
// each field keeps its own label. Nothing above the fields repeats what they hold.
const rowGrid =
  "grid grid-cols-[4rem_minmax(0,1fr)] items-center gap-x-3 gap-y-2 md:grid-cols-[4rem_minmax(0,1fr)_minmax(0,1fr)_7rem_7rem_5rem]";

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
    // What the two ticks do, said once above the rows rather than on every row.
    <div {...helpScope}>
      <HelpLine className="pb-2">
        Whole word skips matches inside longer words. Match case only matches the same capitals.
      </HelpLine>
      <div
        aria-hidden="true"
        className={`${rowGrid} max-md:hidden px-3 pb-1 text-label text-ink-2`}
      >
        <span />
        <span>Written</span>
        <span>Say it as</span>
      </div>
      <List label="Narration aliases">
        {rows.map(({ row, index }) => {
          const id = `${idPrefix}-${row.key}`;
          const error = errors[index];
          const written = row.written.trim();
          const number = String(index + 1);
          return (
            <li key={row.key} className="sl-row py-2">
              <div className={rowGrid}>
                {/* The number the server's errors use, kept while a search hides other rows. */}
                <span className="flex items-center gap-2 text-small text-ink-3 tabular-nums">
                  <RowCheck
                    selection={selection}
                    value={String(row.key)}
                    label={`Alias ${number}${written === "" ? "" : ` (${written})`}`}
                  />
                  {number}
                </span>
                <label className="grid gap-1 text-label text-ink-2" htmlFor={`${id}-written`}>
                  <span className="md:sr-only">Written</span>
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
                <label
                  className="grid gap-1 text-label text-ink-2 max-md:col-start-2"
                  htmlFor={`${id}-spoken`}
                >
                  <span className="md:sr-only">Say it as</span>
                  <Input
                    id={`${id}-spoken`}
                    value={row.spoken}
                    placeholder="Doctor"
                    maxLength={500}
                    aria-invalid={error !== undefined}
                    onChange={(event) => update(row.key, { spoken: event.target.value })}
                  />
                </label>
                <span className="flex flex-wrap items-center gap-x-4 max-md:col-start-2 md:contents">
                  <label className="flex min-h-8 items-center gap-2 text-small max-[1099px]:min-h-11">
                    <Checkbox
                      checked={row.wholeWord}
                      onChange={(event) => update(row.key, { wholeWord: event.target.checked })}
                    />
                    Whole word
                  </label>
                  <label className="flex min-h-8 items-center gap-2 text-small max-[1099px]:min-h-11">
                    <Checkbox
                      checked={row.caseSensitive}
                      onChange={(event) => update(row.key, { caseSensitive: event.target.checked })}
                    />
                    Match case
                  </label>
                  <Button
                    variant="quiet"
                    size="small"
                    aria-label={`Remove alias ${number}`}
                    onClick={() => remove(row.key)}
                  >
                    Remove
                  </Button>
                </span>
                {error === undefined ? null : (
                  <p
                    id={`${id}-error`}
                    className="col-start-2 m-0 text-small text-danger md:col-span-5"
                  >
                    {error}
                  </p>
                )}
              </div>
            </li>
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
