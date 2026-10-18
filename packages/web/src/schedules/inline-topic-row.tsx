import { type ReactElement, useEffect, useState } from "react";
import { Input } from "@/components/kit/field";
import { ListRow } from "@/components/kit/list-row";
import { RowCheck, type Selection } from "@/components/selection";
import { altArrowMove, type MoveTo, moveKeys, TopicRowActions } from "./topic-row-actions";
import { type TopicScore, TopicScoreChip } from "./topic-score";

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
  score,
  scored = false,
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
  // While the schedule ranks topics: `scored` keeps the chip's place on a row not scored yet,
  // so every title starts at the same line.
  readonly score?: TopicScore | undefined;
  readonly scored?: boolean;
}): ReactElement {
  const [value, setValue] = useState(title);
  useEffect(() => setValue(title), [title]);
  return (
    <ListRow
      // The title field takes the row's free width, so a long topic reads whole.
      className="sl-row--wide-title"
      lead={
        <span className="flex shrink-0 items-center gap-2">
          <RowCheck selection={selection} value={rowKey} label={title} />
          <span className="w-7 text-right text-small text-ink-3 tabular-nums">{index + 1}</span>
          {scored ? (
            <span className="flex w-[6.5rem] shrink-0 items-center">
              <TopicScoreChip title={title} score={score} />
            </span>
          ) : (
            <TopicScoreChip title={title} score={score} />
          )}
        </span>
      }
      title={
        <Input
          ref={inputRef}
          aria-label={`Topic ${String(index + 1)}`}
          aria-keyshortcuts={moveKeys}
          maxLength={200}
          value={value}
          className="w-full min-w-[12rem]"
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
