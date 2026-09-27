import type { ScheduleSummary } from "@app/slices/schedules/model.js";
import { queueMax } from "@app/slices/schedules/schema.js";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowDownIcon, ArrowUpIcon, PlusIcon, XIcon } from "lucide-react";
import { type FormEvent, type ReactElement, useEffect, useRef, useState } from "react";
import { useApp } from "@/app-context";
import { Button, IconButton } from "@/components/kit/button";
import { Input } from "@/components/kit/field";
import { helpScope } from "@/components/kit/info-tip";
import { List, ListRow } from "@/components/kit/list-row";
import { SectionHead } from "@/components/kit/section-head";
import { useToast } from "@/components/kit/toast";
import { calendarKey, replaceTopics, schedulesKey } from "./api";

type Items = ScheduleSummary["items"];

// The picked schedule's queued topics, edited where they are shown: add one, rename one in its
// field, move it up or down, remove it. Each change is saved at once (only the queue, never the
// rest of the schedule) and its toast carries Undo. The full form under Edit stays for the
// table and YAML ways of writing topics and for a topic's own keyword values.
export function InlineTopics({ schedule }: { readonly schedule: ScheduleSummary }): ReactElement {
  const { api } = useApp();
  const client = useQueryClient();
  const notify = useToast();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // One save at a time, even from a handler that still sees the state before the last press.
  const inFlight = useRef(false);
  const [draft, setDraft] = useState("");
  // The newest saved version: a second change made before the list refetches builds on it.
  const latest = useRef(schedule);
  if (schedule.version > latest.current.version) latest.current = schedule;
  const items = latest.current.items;
  const topicWord = schedule.topicKeyword === null ? "title" : `{{${schedule.topicKeyword}}}`;

  const save = async (next: Items, done: string, undo: boolean): Promise<boolean> => {
    if (inFlight.current) return false;
    inFlight.current = true;
    const before = latest.current;
    setSaving(true);
    setError(null);
    try {
      const reply = await replaceTopics(api, before.id, {
        baseVersion: before.version,
        items: next,
      });
      if (!reply.ok) {
        setError(
          reply.reason === "conflict"
            ? "The topics weren't saved: this schedule changed since the page loaded, possibly because a run just took a topic. The list now shows the latest; make your change again."
            : `The topics weren't saved: ${reply.message}`,
        );
        await client.invalidateQueries({ queryKey: schedulesKey });
        return false;
      }
      latest.current = reply.value;
      client.setQueryData<readonly ScheduleSummary[]>(schedulesKey, (old) =>
        old?.map((one) => (one.id === reply.value.id ? reply.value : one)),
      );
      void client.invalidateQueries({ queryKey: calendarKey });
      notify(
        done,
        "success",
        undo
          ? {
              label: "Undo",
              run: () => void save(before.items, "Put the topics back as they were.", false),
            }
          : undefined,
      );
      return true;
    } catch (cause) {
      setError(
        `The topics weren't saved: ${cause instanceof Error ? cause.message : "Slopify didn't answer."} Check that Slopify is running, then try again.`,
      );
      return false;
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  };

  const add = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const title = draft.trim();
    if (title === "") {
      setError(`Write the new topic's ${topicWord} first, then press Add topic.`);
      return;
    }
    if (await save([...items, { title, values: {} }], `Added “${title}”.`, true)) setDraft("");
  };
  const rename = (index: number, title: string): void => {
    const row = items[index];
    if (row === undefined || title.trim() === row.title) return;
    if (title.trim() === "") {
      setError(
        `Topic ${String(index + 1)} needs a ${topicWord}. Write one, or press its Remove button.`,
      );
      return;
    }
    void save(
      items.map((one, at) => (at === index ? { ...one, title: title.trim() } : one)),
      `Renamed to “${title.trim()}”.`,
      true,
    );
  };
  const move = (index: number, by: -1 | 1): void => {
    const row = items[index];
    if (row === undefined) return;
    const next = [...items];
    next.splice(index, 1);
    next.splice(index + by, 0, row);
    void save(next, `Moved “${row.title}” ${by === -1 ? "up" : "down"}.`, true);
  };
  const remove = (index: number): void => {
    const row = items[index];
    if (row === undefined) return;
    void save(
      items.filter((_, at) => at !== index),
      `Removed “${row.title}”.`,
      true,
    );
  };

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
      {error === null ? null : (
        <p role="alert" className="m-0 mt-2 text-small text-danger">
          {error}
        </p>
      )}
      {items.length === 0 ? null : (
        <List label={`Topics of ${schedule.name}`} className="mt-2">
          {items.map((row, index) => (
            <TopicRow
              key={`${String(index)}:${row.title}`}
              index={index}
              title={row.title}
              count={items.length}
              busy={saving}
              onRename={(title) => rename(index, title)}
              onMove={(by) => move(index, by)}
              onRemove={() => remove(index)}
            />
          ))}
        </List>
      )}
      <form
        className="mt-3 flex flex-wrap items-center gap-2"
        onSubmit={(event) => void add(event)}
      >
        <Input
          aria-label="New topic"
          placeholder={schedule.topicKeyword === null ? "New topic" : `New ${topicWord}`}
          maxLength={200}
          value={draft}
          className="min-w-0 flex-1"
          onChange={(event) => setDraft(event.target.value)}
        />
        <Button
          type="submit"
          size="small"
          disabled={saving || items.length >= queueMax}
          disabledReason={
            saving ? "Saving the last change" : `A queue holds at most ${String(queueMax)} topics`
          }
        >
          <PlusIcon aria-hidden="true" className="size-4" strokeWidth={1.75} />
          Add topic
        </Button>
      </form>
    </section>
  );
}

function TopicRow({
  index,
  title,
  count,
  busy,
  onRename,
  onMove,
  onRemove,
}: {
  readonly index: number;
  readonly title: string;
  readonly count: number;
  readonly busy: boolean;
  readonly onRename: (title: string) => void;
  readonly onMove: (by: -1 | 1) => void;
  readonly onRemove: () => void;
}): ReactElement {
  const [value, setValue] = useState(title);
  useEffect(() => setValue(title), [title]);
  const label = `Topic ${String(index + 1)}`;
  return (
    <ListRow
      lead={<span className="w-6 text-small text-ink-3 tabular-nums">{index + 1}</span>}
      title={
        <Input
          aria-label={label}
          maxLength={200}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onBlur={() => onRename(value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              onRename(value);
            } else if (event.key === "Escape") setValue(title);
          }}
        />
      }
      actions={
        <>
          <IconButton
            size="small"
            label={`Move ${title} up`}
            disabled={busy || index === 0}
            onClick={() => onMove(-1)}
          >
            <ArrowUpIcon aria-hidden="true" strokeWidth={1.75} />
          </IconButton>
          <IconButton
            size="small"
            label={`Move ${title} down`}
            disabled={busy || index === count - 1}
            onClick={() => onMove(1)}
          >
            <ArrowDownIcon aria-hidden="true" strokeWidth={1.75} />
          </IconButton>
          <IconButton size="small" label={`Remove ${title}`} disabled={busy} onClick={onRemove}>
            <XIcon aria-hidden="true" strokeWidth={1.75} />
          </IconButton>
        </>
      }
    />
  );
}
