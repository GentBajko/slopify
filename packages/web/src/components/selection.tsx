import {
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react";
import { Button } from "@/components/kit/button";
import { cn } from "@/lib/utils";

// Bulk selection for a collection (docs/ux-audit-2026-10.md, Lists and collections): visible
// checkboxes that work by touch and keyboard (Space toggles a focused box, Shift+click ticks a
// range, Esc anywhere in the list clears), an indeterminate Select all, and a bar that says how
// many of how many are selected and carries the bulk actions.

export interface Selection<K extends string> {
  // The selected keys, in the order of the rows.
  readonly selected: readonly K[];
  readonly count: number;
  readonly has: (key: K) => boolean;
  // `range` (Shift held) ticks every row between the last one pressed and this one.
  readonly toggle: (key: K, range?: boolean) => void;
  readonly setAll: (on: boolean) => void;
  readonly clear: () => void;
  // Esc clears the selection; put it on the element that holds the rows.
  readonly onKeyDown: (event: KeyboardEvent) => void;
}

export function useSelection<K extends string>(keys: readonly K[]): Selection<K> {
  const [picked, setPicked] = useState<ReadonlySet<K>>(() => new Set());
  const anchor = useRef<K | undefined>(undefined);
  // Rows that left the collection (removed, filtered out) leave the selection with them.
  const selected = useMemo(() => keys.filter((key) => picked.has(key)), [keys, picked]);

  const toggle = useCallback(
    (key: K, range = false) => {
      // Read before the update runs: the updater is called later, after the anchor moved.
      const from = anchor.current === undefined ? -1 : keys.indexOf(anchor.current);
      const to = keys.indexOf(key);
      setPicked((current) => {
        const next = new Set(current);
        if (range && from >= 0 && to >= 0) {
          const on = !current.has(key);
          for (const each of keys.slice(Math.min(from, to), Math.max(from, to) + 1)) {
            if (on) next.add(each);
            else next.delete(each);
          }
        } else if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
      anchor.current = key;
    },
    [keys],
  );
  const setAll = useCallback((on: boolean) => setPicked(on ? new Set(keys) : new Set()), [keys]);
  const clear = useCallback(() => setPicked(new Set()), []);
  const onKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key !== "Escape" || picked.size === 0) return;
      const target = event.target;
      // Esc in a text field belongs to the field (cancel an edit), not the selection.
      if (target instanceof HTMLElement && target.matches("input:not([type=checkbox]), textarea"))
        return;
      event.preventDefault();
      setPicked(new Set());
    },
    [picked],
  );
  return {
    selected,
    count: selected.length,
    has: (key) => picked.has(key),
    toggle,
    setAll,
    clear,
    onKeyDown,
  };
}

const boxClass = "size-4 shrink-0 accent-[var(--color-accent)]";

// One row's checkbox, named "Select row: Cleopatra" (`label` is the row's name). The "Select
// row" prefix is what the help walks accept as self-explanatory (help/coverage.ts). The 16px box
// sits in a 24px label, so the pointer target meets WCAG 2.5.8 without moving the row's text.
export function RowCheck<K extends string>({
  selection,
  value,
  label,
  className,
}: {
  readonly selection: Selection<K>;
  readonly value: K;
  readonly label: string;
  readonly className?: string;
}): ReactElement {
  const shift = useRef(false);
  return (
    <label
      data-slot="row-check"
      // Shift+click ticks a range. A press on the label reaches the box as a click without
      // the key held, so the key is read where the press lands.
      onPointerDown={(event) => {
        shift.current = event.shiftKey;
      }}
      className={cn(
        "relative z-10 -m-1 inline-grid size-6 shrink-0 cursor-pointer place-items-center",
        className,
      )}
    >
      <input
        type="checkbox"
        aria-label={`Select row: ${label}`}
        checked={selection.has(value)}
        onClick={(event) => {
          if (event.shiftKey) shift.current = true;
        }}
        onChange={() => {
          selection.toggle(value, shift.current);
          shift.current = false;
        }}
        className={boxClass}
      />
    </label>
  );
}

// Select all, indeterminate while some rows are ticked. `scope` says what "all" covers when a
// filter hides rows: "Select all 12 shown".
export function SelectAllBox<K extends string>({
  selection,
  total,
  scope,
}: {
  readonly selection: Selection<K>;
  readonly total: number;
  readonly scope?: string;
}): ReactElement {
  const all = total > 0 && selection.count === total;
  return (
    <label className="flex min-h-8 cursor-pointer items-center gap-2 text-small text-ink-2">
      <input
        type="checkbox"
        checked={all}
        disabled={total === 0}
        ref={(box) => {
          if (box !== null) box.indeterminate = selection.count > 0 && !all;
        }}
        onChange={(event) => selection.setAll(event.currentTarget.checked)}
        className={boxClass}
      />
      {scope ?? "Select all"}
    </label>
  );
}

// The bar above a list: Select all, the count and scope ("2 of 14 selected"), the bulk actions
// and Clear. The actions stay in place and disable while nothing is selected (pass
// `disabled={selection.count === 0}`), so nothing jumps when the first box is ticked.
export function SelectionBar<K extends string>({
  selection,
  total,
  noun,
  scope,
  actions,
  className,
}: {
  readonly selection: Selection<K>;
  readonly total: number;
  // "item" / "topic": "3 of 12 topics selected".
  readonly noun: readonly [singular: string, plural: string];
  readonly scope?: string;
  readonly actions: ReactNode;
  readonly className?: string;
}): ReactElement {
  const count = selection.count;
  return (
    <div
      data-slot="selection-bar"
      className={cn("flex min-h-10 flex-wrap items-center gap-x-3 gap-y-2", className)}
    >
      <SelectAllBox
        selection={selection}
        total={total}
        {...(scope === undefined ? {} : { scope })}
      />
      <span className="text-small text-ink-2 tabular-nums">
        {count === 0
          ? `${String(total)} ${total === 1 ? noun[0] : noun[1]}`
          : `${String(count)} of ${String(total)} ${total === 1 ? noun[0] : noun[1]} selected`}
      </span>
      <span className="flex-1" />
      <div className="flex flex-wrap items-center gap-2">
        {actions}
        <Button
          size="small"
          variant="quiet"
          disabled={count === 0}
          disabledReason="Nothing is selected"
          onClick={selection.clear}
        >
          Clear selection
        </Button>
      </div>
    </div>
  );
}

// "Restored 3 items." / "Removed 1 topic." for a bulk action's toast or status line.
export function counted(count: number, singular: string, plural: string): string {
  return `${String(count)} ${count === 1 ? singular : plural}`;
}
