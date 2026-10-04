import { type ReactElement, useEffect, useState } from "react";
import { Input } from "@/components/kit/field";
import { ListRow } from "@/components/kit/list-row";
import { RowCheck, type Selection } from "@/components/selection";
import { altArrowMove, type MoveTo, moveKeys, TopicRowActions } from "./topic-row-actions";

// One queued topic: its checkbox, its place, its title field (Enter saves, Esc puts it back,
// Alt+Up/Down moves it), Up, Down and Remove on the row, and the rarer moves under More.
export function InlineTopicRow({
  rowKey,
  index,
  title,
  count,
  busy,
  selection,
  inputRef,
  onRename,
  onMove,
  onRemove,
  onInsertBelow,
  onDuplicate,
}: {
  readonly rowKey: string;
  readonly index: number;
  readonly title: string;
  readonly count: number;
  readonly busy: boolean;
  readonly selection: Selection<string>;
  readonly inputRef: (input: HTMLInputElement | null) => void;
  readonly onRename: (title: string) => void;
  readonly onMove: MoveTo;
  readonly onRemove: () => void;
  readonly onInsertBelow: () => void;
  readonly onDuplicate: () => void;
}): ReactElement {
  const [value, setValue] = useState(title);
  useEffect(() => setValue(title), [title]);
  return (
    <ListRow
      lead={
        <span className="flex items-center gap-2">
          <RowCheck selection={selection} value={rowKey} label={title} />
          <span className="w-7 text-right text-small text-ink-3 tabular-nums">{index + 1}</span>
        </span>
      }
      title={
        <Input
          ref={inputRef}
          aria-label={`Topic ${String(index + 1)}`}
          aria-keyshortcuts={moveKeys}
          maxLength={200}
          value={value}
          className="min-w-[12rem]"
          onChange={(event) => setValue(event.target.value)}
          onBlur={() => onRename(value)}
          onKeyDown={(event) => {
            if (altArrowMove(event, { index, count, busy }, onMove)) return;
            if (event.key === "Enter") {
              event.preventDefault();
              onRename(value);
            } else if (event.key === "Escape" && value !== title) {
              event.preventDefault();
              setValue(title);
            }
          }}
        />
      }
      actions={
        <TopicRowActions
          name={title}
          index={index}
          count={count}
          busy={busy}
          onMove={onMove}
          onRemove={onRemove}
          onInsertBelow={onInsertBelow}
          onDuplicate={onDuplicate}
        />
      }
    />
  );
}
