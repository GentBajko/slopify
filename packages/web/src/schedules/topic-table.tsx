import { type TopicRow, topicValueMax } from "@app/slices/schedules/topic-list.js";
import { PlusIcon, XIcon } from "lucide-react";
import { type ReactElement, useEffect, useRef } from "react";
import { Button, IconButton } from "@/components/kit/button";
import { Input, Select } from "@/components/kit/field";
import { helpScope, InfoTip } from "@/components/kit/info-tip";
import { useToast } from "@/components/kit/toast";
import { counted, RowCheck, SelectionBar, useSelection } from "@/components/selection";
import { type TopicQueue, withRows } from "./topic-queue-state";
import { altArrowMove, moveKeys, TopicRowActions } from "./topic-row-actions";
import { insertedAt, moved, newKeys, reconcileKeys, topicLines } from "./topic-rows";

const blank = (): TopicRow => ({ title: "", values: {} });

// A row per topic, a column per keyword it sets itself, and the project title it makes. Rows
// move (Up, Down, Alt+Up/Down, or More), Enter in a topic adds a row under it, a pasted list
// becomes one row per line, and ticked rows are removed together with Undo in the toast.
export function TopicTable({
  queue,
  onQueue,
  keyword,
  addable,
  titleOf,
}: {
  readonly queue: TopicQueue;
  readonly onQueue: (next: TopicQueue) => void;
  readonly keyword: string | null;
  readonly addable: readonly string[];
  readonly titleOf: (row: TopicRow) => string | undefined;
}): ReactElement {
  const notify = useToast();
  const topicName = keyword === null ? "Title" : `{{${keyword}}}`;
  // Each row keeps its own key while rows move; rows changed elsewhere (another mode) are
  // matched by title.
  const keyed = useRef({ rows: queue.rows, keys: newKeys(queue.rows.length) as readonly string[] });
  if (keyed.current.rows !== queue.rows)
    keyed.current = {
      rows: queue.rows,
      keys: reconcileKeys(keyed.current.rows, keyed.current.keys, queue.rows),
    };
  const keys = keyed.current.keys;
  // Undo runs later, against the queue as it is then.
  const latest = useRef(queue);
  latest.current = queue;
  const selection = useSelection(keys);
  const inputs = useRef(new Map<string, HTMLInputElement>());
  const focusKey = useRef<string | null>(null);
  useEffect(() => {
    const key = focusKey.current;
    if (key === null || !keys.includes(key)) return;
    focusKey.current = null;
    inputs.current.get(key)?.focus();
  }, [keys]);

  const commit = (rows: readonly TopicRow[], nextKeys: readonly string[], focus?: string) => {
    keyed.current = { rows, keys: nextKeys };
    if (focus !== undefined) focusKey.current = focus;
    onQueue({ ...queue, rows });
  };
  const insert = (at: number, add: readonly TopicRow[]) => {
    const added = newKeys(add.length);
    commit(insertedAt(queue.rows, at, add), insertedAt(keys, at, added), added[0]);
  };
  const setRow = (index: number, row: TopicRow) =>
    commit(
      queue.rows.map((one, at) => (at === index ? row : one)),
      keys,
    );
  const move = (from: number, to: number) => {
    const key = keys[from];
    commit(moved(queue.rows, from, to), moved(keys, from, to), key);
  };
  const remove = (indexes: readonly number[]) => {
    const gone = [...new Set(indexes)].filter((at) => at >= 0).sort((a, b) => a - b);
    const removed = gone.flatMap((at) => {
      const row = queue.rows[at];
      return row === undefined ? [] : [{ at, row }];
    });
    if (removed.length === 0) return;
    const goneSet = new Set(gone);
    commit(
      queue.rows.filter((_, at) => !goneSet.has(at)),
      keys.filter((_, at) => !goneSet.has(at)),
    );
    const first = removed[0]?.row.title.trim() ?? "";
    notify(
      removed.length === 1
        ? `Removed ${first === "" ? "an empty topic" : `“${first}”`}. Save the schedule to keep it.`
        : `Removed ${counted(removed.length, "topic", "topics")}. Save the schedule to keep it.`,
      "success",
      {
        label: "Undo",
        run: () => {
          let rows = [...latest.current.rows];
          for (const { at, row } of removed) rows = insertedAt(rows, at, [row]);
          onQueue(withRows(latest.current, rows, keyword));
        },
      },
    );
  };

  return (
    <div className="flex flex-col gap-3" {...helpScope}>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="small" onClick={() => insert(queue.rows.length, [blank()])}>
          <PlusIcon aria-hidden="true" className="size-4" strokeWidth={1.75} />
          Add topic
        </Button>
        {addable.length === 0 ? null : (
          <Select
            aria-label="Set a keyword per topic"
            value=""
            className="w-auto"
            onChange={(event) => {
              const name = event.target.value;
              if (name !== "") onQueue({ ...queue, columns: [...queue.columns, name] });
            }}
          >
            <option value="">Set a keyword per topic…</option>
            {addable.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </Select>
        )}
      </div>
      {/* Esc anywhere in the table clears the ticked rows. */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: Esc is handed down from the rows' own controls. */}
      <div className="flex flex-col gap-2" onKeyDown={selection.onKeyDown}>
        {queue.rows.length > 1 ? (
          <SelectionBar
            selection={selection}
            total={queue.rows.length}
            noun={["topic", "topics"]}
            actions={
              <Button
                size="small"
                variant="quiet"
                disabled={selection.count === 0}
                disabledReason="Tick the topics to remove"
                onClick={() => {
                  remove(selection.selected.map((key) => keys.indexOf(key)));
                  selection.clear();
                }}
              >
                Remove selected
              </Button>
            }
          />
        ) : null}
        <div className="overflow-x-auto">
          <table className="sl-table" aria-label="Topics">
            <thead>
              <tr>
                <th scope="col">
                  <span className="sr-only">Select</span>
                </th>
                <th scope="col">#</th>
                <th scope="col">
                  <span className="inline-flex items-center gap-1">
                    {topicName}
                    <InfoTip id="planning.schedule.topic-table" className="-my-1" />
                  </span>
                </th>
                {queue.columns.map((column) => (
                  <th key={column} scope="col">
                    <span className="inline-flex items-center gap-1">
                      {`{{${column}}}`}
                      <IconButton
                        label={`Use the every-run ${column} for all topics`}
                        size="small"
                        onClick={() =>
                          onQueue({
                            ...queue,
                            columns: queue.columns.filter((one) => one !== column),
                            rows: queue.rows.map((row) => ({
                              title: row.title,
                              values: Object.fromEntries(
                                Object.entries(row.values).filter(([name]) => name !== column),
                              ),
                            })),
                          })
                        }
                      >
                        <XIcon aria-hidden="true" strokeWidth={1.75} />
                      </IconButton>
                    </span>
                  </th>
                ))}
                <th scope="col">Project title</th>
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {queue.rows.map((row, index) => {
                const key = keys[index] ?? String(index);
                const name = row.title.trim() === "" ? `topic ${String(index + 1)}` : row.title;
                return (
                  <tr key={key}>
                    <td>
                      <RowCheck selection={selection} value={key} label={name} />
                    </td>
                    <td className="num">{index + 1}</td>
                    <td>
                      <Input
                        ref={(input) => {
                          if (input === null) inputs.current.delete(key);
                          else inputs.current.set(key, input);
                        }}
                        aria-label={`Topic ${String(index + 1)} ${topicName}`}
                        aria-keyshortcuts={moveKeys}
                        maxLength={200}
                        value={row.title}
                        className="min-w-[14rem]"
                        onChange={(event) => setRow(index, { ...row, title: event.target.value })}
                        onPaste={(event) => {
                          const lines = topicLines(event.clipboardData.getData("text"));
                          if (lines.length < 2) return;
                          event.preventDefault();
                          const [head = "", ...rest] = lines;
                          const rows = queue.rows.map((one, at) =>
                            at === index ? { ...one, title: `${one.title}${head}` } : one,
                          );
                          const added = newKeys(rest.length);
                          commit(
                            insertedAt(
                              rows,
                              index + 1,
                              rest.map((title) => ({ title, values: {} })),
                            ),
                            insertedAt(keys, index + 1, added),
                            added.at(-1),
                          );
                        }}
                        onKeyDown={(event) => {
                          if (
                            altArrowMove(
                              event,
                              { index, count: queue.rows.length, busy: false },
                              (to) => move(index, to),
                            )
                          )
                            return;
                          if (event.key === "Enter") {
                            event.preventDefault();
                            insert(index + 1, [blank()]);
                          }
                        }}
                      />
                    </td>
                    {queue.columns.map((column) => (
                      <td key={column}>
                        <Input
                          aria-label={`Topic ${String(index + 1)} ${column}`}
                          maxLength={topicValueMax}
                          placeholder="Every-run value"
                          value={row.values[column] ?? ""}
                          className="min-w-[8rem]"
                          onChange={(event) =>
                            setRow(index, {
                              ...row,
                              values: { ...row.values, [column]: event.target.value },
                            })
                          }
                        />
                      </td>
                    ))}
                    <td className="min-w-[180px] text-small text-ink-2">{titleOf(row) ?? "—"}</td>
                    <td>
                      <span className="flex items-center gap-1">
                        <TopicRowActions
                          name={name}
                          index={index}
                          count={queue.rows.length}
                          busy={false}
                          onMove={(to) => move(index, to)}
                          onRemove={() => remove([index])}
                          onInsertBelow={() => insert(index + 1, [blank()])}
                          onDuplicate={() => insert(index + 1, [row])}
                        />
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
