import { type ReactElement, useId, useRef } from "react";
import { Button } from "@/components/kit/button";
import { Field, Input } from "@/components/kit/field";
import { helpScope } from "@/components/kit/info-tip";
import { List, ListRow } from "@/components/kit/list-row";
import { SectionHead } from "@/components/kit/section-head";
import { ShowMore, useBounded } from "./bounded-list";

const plural = (n: number, one: string, many: string): string =>
  `${n.toLocaleString("en")} ${n === 1 ? one : many}`;

// A Studio CSV's titles before saving: one tick per title, in file order.
export interface Preview {
  readonly titles: readonly string[];
  readonly ticked: readonly boolean[];
}

// "Keep only titles containing…": the titles holding the text (any case) are ticked, the rest
// unticked; no text ticks them all.
export function tickedBy(titles: readonly string[], filter: string): readonly boolean[] {
  const needle = filter.trim().toLowerCase();
  return titles.map((title) => needle === "" || title.toLowerCase().includes(needle));
}

// Shift+click ticks or unticks every title from the last one pressed to this one.
export function tickRange(
  ticked: readonly boolean[],
  from: number | undefined,
  to: number,
  on: boolean,
): readonly boolean[] {
  const low = from === undefined ? to : Math.min(from, to);
  const high = from === undefined ? to : Math.max(from, to);
  return ticked.map((tick, at) => (at >= low && at <= high ? on : tick));
}

// The CSV's titles with a tick each, so videos of other channels in the same Studio export
// (another game, another series) stay out; only the ticked ones are added.
export function CsvPreview({
  preview,
  filter,
  busy,
  onFilter,
  onTick,
  onSave,
  onCancel,
}: {
  readonly preview: Preview;
  readonly filter: string;
  readonly busy: boolean;
  readonly onFilter: (filter: string) => void;
  readonly onTick: (ticked: readonly boolean[]) => void;
  readonly onSave: () => void;
  readonly onCancel: () => void;
}): ReactElement {
  const id = useId();
  const anchor = useRef<number | undefined>(undefined);
  const shift = useRef(false);
  const count = preview.ticked.filter(Boolean).length;
  const rows = useBounded(preview.titles, preview.titles);
  return (
    <section aria-label="Titles in the CSV" className="mt-4" {...helpScope}>
      <SectionHead
        as="h3"
        title="Titles in the CSV"
        info="planning.channel.videos-ticks"
        meta={`${count.toLocaleString("en")} of ${plural(preview.titles.length, "title", "titles")} ticked · Shift+click ticks a range`}
      >
        <Button variant="primary" disabled={busy || count === 0} onClick={onSave}>
          Add {plural(count, "ticked title", "ticked titles")}
        </Button>
        <Button variant="quiet" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
      </SectionHead>
      <Field
        label="Keep only titles containing…"
        tip="planning.channel.videos-filter"
        tipLabel="Keep only titles containing"
      >
        <Input value={filter} maxLength={200} onChange={(event) => onFilter(event.target.value)} />
      </Field>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button size="small" disabled={busy} onClick={() => onTick(preview.titles.map(() => true))}>
          Tick all
        </Button>
        <Button
          size="small"
          disabled={busy}
          onClick={() => onTick(preview.titles.map(() => false))}
        >
          Untick all
        </Button>
      </div>
      <List label="Titles in the CSV" className="mt-2">
        {rows.shown.map((title, index) => (
          <ListRow
            // biome-ignore lint/suspicious/noArrayIndexKey: a CSV may list one title twice; rows never reorder.
            key={index}
            lead={
              <input
                id={`${id}-${index}`}
                type="checkbox"
                checked={preview.ticked[index] === true}
                disabled={busy}
                className="size-4 shrink-0 accent-accent"
                onClick={(event) => {
                  shift.current = event.shiftKey;
                }}
                onChange={(event) => {
                  const from = shift.current ? anchor.current : undefined;
                  shift.current = false;
                  anchor.current = index;
                  onTick(tickRange(preview.ticked, from, index, event.target.checked));
                }}
              />
            }
            title={<label htmlFor={`${id}-${index}`}>{title}</label>}
          />
        ))}
      </List>
      <ShowMore hidden={rows.hidden} onMore={rows.more} />
    </section>
  );
}
