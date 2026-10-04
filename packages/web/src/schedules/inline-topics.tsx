import type { ScheduleSummary } from "@app/slices/schedules/model.js";
import { queueMax } from "@app/slices/schedules/schema.js";
import { type ReactElement, useEffect, useRef, useState } from "react";
import { Button } from "@/components/kit/button";
import { helpScope } from "@/components/kit/info-tip";
import { List, ListRow } from "@/components/kit/list-row";
import { SectionHead } from "@/components/kit/section-head";
import { SelectionBar, useSelection } from "@/components/selection";
import { InlineTopicRow } from "./inline-topic-row";
import { TopicAddField } from "./topic-add-field";
import { useInlineQueue } from "./use-inline-queue";

// A queue this long shows its first rows and a Show all button, so the page stays quick.
export const shownAtFirst = 100;

// The picked schedule's queued topics, edited where they are shown: add one or paste several,
// rename one in its field, move it, insert or duplicate beside it, remove one or the ticked
// ones. Each change is saved at once (only the queue, never the rest of the schedule) and its
// toast carries Undo. The full form under Edit stays for the table and YAML ways of writing
// topics and for a topic's own keyword values.
export function InlineTopics({ schedule }: { readonly schedule: ScheduleSummary }): ReactElement {
  const topicWord = schedule.topicKeyword === null ? "title" : `{{${schedule.topicKeyword}}}`;
  const queue = useInlineQueue(schedule, topicWord);
  const { items, keys, saving } = queue;
  const selection = useSelection(keys);
  const [insertAfter, setInsertAfter] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const inputs = useRef(new Map<string, HTMLInputElement>());
  // A moved, added or duplicated row's field takes focus once the list shows it, showing the
  // whole queue first when the row landed past the first ones.
  useEffect(() => {
    const key = queue.focusKey.current;
    if (key === null || !keys.includes(key)) return;
    if (!showAll && keys.indexOf(key) >= shownAtFirst) {
      setShowAll(true);
      return;
    }
    queue.focusKey.current = null;
    inputs.current.get(key)?.focus();
  }, [keys, queue.focusKey, showAll]);
  const full = items.length >= queueMax;
  const addDisabledReason = saving
    ? "Saving the last change"
    : `A queue holds at most ${String(queueMax)} topics`;
  const shown = showAll ? items.length : Math.min(items.length, shownAtFirst);
  const insertAt = insertAfter === null ? -1 : keys.indexOf(insertAfter);

  return (
    <section aria-label="Queued topics" className="mt-6" {...helpScope}>
      <SectionHead
        as="h3"
        title={`Queued topics · ${String(items.length)}`}
        info="planning.schedule.inline-topics"
        meta={
          schedule.topicKeyword === null
            ? "Each topic becomes the next project's title."
            : `Each topic fills ${topicWord}; the next run takes the first.`
        }
      />
      {queue.error === null ? null : (
        <p role="alert" className="m-0 mt-2 text-small text-danger">
          {queue.error}
        </p>
      )}
      {/* Above the list, so it stays in reach however long the queue grows. */}
      <TopicAddField
        className="mt-3"
        label="New topic"
        placeholder={`${schedule.topicKeyword === null ? "New topic" : `New ${topicWord}`}, or paste several lines`}
        buttonLabel="Add topic"
        disabled={saving || full}
        disabledReason={addDisabledReason}
        onAdd={(titles) => queue.add(titles)}
      />
      {items.length === 0 ? null : (
        // Esc anywhere in the list clears the ticked rows.
        // biome-ignore lint/a11y/noStaticElementInteractions: Esc is handed down from the rows' own controls.
        <div onKeyDown={selection.onKeyDown}>
          {items.length > 1 ? (
            <SelectionBar
              className="mt-3"
              selection={selection}
              total={items.length}
              noun={["topic", "topics"]}
              actions={
                <Button
                  size="small"
                  variant="quiet"
                  disabled={saving || selection.count === 0}
                  disabledReason={saving ? "Saving the last change" : "Tick the topics to remove"}
                  onClick={() =>
                    void queue
                      .remove(selection.selected.map((key) => keys.indexOf(key)))
                      .then((done) => {
                        if (done) selection.clear();
                      })
                  }
                >
                  Remove selected
                </Button>
              }
            />
          ) : null}
          <List label={`Topics of ${schedule.name}`} className="mt-2">
            {items.slice(0, shown).flatMap((row, index) => {
              const key = keys[index] ?? String(index);
              const line = (
                <InlineTopicRow
                  key={key}
                  rowKey={key}
                  index={index}
                  title={row.title}
                  count={items.length}
                  busy={saving}
                  selection={selection}
                  inputRef={(input) => {
                    if (input === null) inputs.current.delete(key);
                    else inputs.current.set(key, input);
                  }}
                  onRename={(title) => queue.rename(index, title)}
                  onMove={(to, where) => queue.move(index, to, where)}
                  onRemove={() => void queue.remove([index])}
                  onInsertBelow={() => setInsertAfter(key)}
                  onDuplicate={() => queue.duplicate(index)}
                />
              );
              return index !== insertAt
                ? [line]
                : [
                    line,
                    <ListRow
                      key={`${key}:insert`}
                      title={
                        <TopicAddField
                          autoFocus
                          label={`New topic below ${String(index + 1)}`}
                          placeholder="New topic, or paste several lines"
                          buttonLabel="Insert"
                          disabled={saving || full}
                          disabledReason={addDisabledReason}
                          onAdd={async (titles) => {
                            const done = await queue.add(titles, index + 1, true);
                            if (done) setInsertAfter(null);
                            return done;
                          }}
                          onCancel={() => setInsertAfter(null)}
                        />
                      }
                    />,
                  ];
            })}
          </List>
          {shown < items.length ? (
            <Button variant="quiet" size="small" className="mt-2" onClick={() => setShowAll(true)}>
              {`Show all ${String(items.length)} topics`}
            </Button>
          ) : null}
        </div>
      )}
    </section>
  );
}
