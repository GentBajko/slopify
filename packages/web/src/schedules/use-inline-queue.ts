import type { ScheduleSummary } from "@app/slices/schedules/model.js";
import { queueMax } from "@app/slices/schedules/schema.js";
import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { useApp } from "@/app-context";
import { useToast } from "@/components/kit/toast";
import { counted } from "@/components/selection";
import { calendarKey, moveTopic, replaceTopics, type ScheduleReply, schedulesKey } from "./api";
import { insertedAt, moved, newKeys, reconcileKeys } from "./topic-rows";

type Items = ScheduleSummary["items"];
type Job = (base: ScheduleSummary) => Promise<ScheduleReply<ScheduleSummary>>;

export interface InlineQueue {
  readonly items: Items;
  readonly keys: readonly string[];
  readonly saving: boolean;
  readonly error: string | null;
  readonly setError: (message: string | null) => void;
  // The row whose title field takes focus once the list shows the saved change.
  readonly focusKey: { current: string | null };
  // `focus` moves focus to the first new row (Insert below); the Add field keeps it otherwise.
  readonly add: (titles: readonly string[], at?: number, focus?: boolean) => Promise<boolean>;
  readonly rename: (index: number, title: string) => void;
  readonly move: (from: number, to: number, where: string) => void;
  readonly remove: (indexes: readonly number[]) => Promise<boolean>;
  readonly duplicate: (index: number) => void;
}

const quoted = (title: string): string => `“${title}”`;

// The picked schedule's queue as the schedule page edits it: every change is saved at once
// against the version on screen, its toast carries Undo, and each row keeps its own key.
export function useInlineQueue(schedule: ScheduleSummary, topicWord: string): InlineQueue {
  const { api } = useApp();
  const client = useQueryClient();
  const notify = useToast();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // One save at a time, even from a handler that still sees the state before the last press.
  const inFlight = useRef(false);
  // The newest saved version: a second change made before the list refetches builds on it.
  const latest = useRef(schedule);
  if (schedule.version > latest.current.version) latest.current = schedule;
  const keyed = useRef({
    version: schedule.version,
    items: schedule.items,
    keys: newKeys(schedule.items.length) as readonly string[],
  });
  if (keyed.current.version !== latest.current.version) {
    const { items } = latest.current;
    keyed.current = {
      version: latest.current.version,
      items,
      keys: reconcileKeys(keyed.current.items, keyed.current.keys, items),
    };
  }
  const focusKey = useRef<string | null>(null);
  const items = latest.current.items;
  const keys = keyed.current.keys;

  const save = async (
    job: Job,
    nextKeys: readonly string[],
    done: string,
    undo: boolean,
  ): Promise<boolean> => {
    if (inFlight.current) return false;
    inFlight.current = true;
    const before = latest.current;
    const beforeKeys = keyed.current.keys;
    setSaving(true);
    setError(null);
    try {
      const reply = await job(before);
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
      keyed.current = {
        version: reply.value.version,
        items: reply.value.items,
        keys:
          nextKeys.length === reply.value.items.length
            ? nextKeys
            : reconcileKeys(before.items, beforeKeys, reply.value.items),
      };
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
              run: () =>
                void save(
                  (base) =>
                    replaceTopics(api, base.id, {
                      baseVersion: base.version,
                      items: before.items,
                    }),
                  beforeKeys,
                  "Put the topics back as they were.",
                  false,
                ),
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
  const replace = (next: Items, nextKeys: readonly string[], done: string): Promise<boolean> =>
    save(
      (base) => replaceTopics(api, base.id, { baseVersion: base.version, items: next }),
      nextKeys,
      done,
      true,
    );

  const add = async (
    titles: readonly string[],
    at = items.length,
    focus = false,
  ): Promise<boolean> => {
    if (titles.length === 0) {
      setError(`Write the new topic's ${topicWord} first, then press Add topic.`);
      return false;
    }
    const room = queueMax - items.length;
    if (titles.length > room) {
      setError(
        `${counted(titles.length, "topic", "topics")} didn't fit: a queue holds at most ${String(queueMax)} and ${counted(room, "more fits", "more fit")}. Remove some topics first, or add fewer lines.`,
      );
      return false;
    }
    const added = newKeys(titles.length);
    const first = added[0];
    if (focus && first !== undefined) focusKey.current = first;
    return replace(
      insertedAt(
        items,
        at,
        titles.map((title) => ({ title, values: {} })),
      ),
      insertedAt(keys, at, added),
      titles.length === 1
        ? `Added ${quoted(titles[0] ?? "")}.`
        : `Added ${counted(titles.length, "topic", "topics")}.`,
    );
  };
  const rename = (index: number, title: string): void => {
    const row = items[index];
    const clean = title.trim();
    if (row === undefined || clean === row.title) return;
    if (clean === "") {
      setError(
        `Topic ${String(index + 1)} needs a ${topicWord}. Write one, or press its Remove button.`,
      );
      return;
    }
    void replace(
      items.map((one, at) => (at === index ? { ...one, title: clean } : one)),
      keys,
      `Renamed to ${quoted(clean)}.`,
    );
  };
  const move = (from: number, to: number, where: string): void => {
    const row = items[from];
    const key = keys[from];
    if (row === undefined || from === to) return;
    if (key !== undefined) focusKey.current = key;
    void save(
      (base) => moveTopic(api, base.id, { baseVersion: base.version, from, to }),
      moved(keys, from, to),
      `Moved ${quoted(row.title)} ${where}.`,
      true,
    );
  };
  const remove = (indexes: readonly number[]): Promise<boolean> => {
    const gone = new Set(indexes);
    const first = items[indexes[0] ?? -1];
    if (first === undefined) return Promise.resolve(false);
    return replace(
      items.filter((_, at) => !gone.has(at)),
      keys.filter((_, at) => !gone.has(at)),
      gone.size === 1
        ? `Removed ${quoted(first.title)}.`
        : `Removed ${counted(gone.size, "topic", "topics")}.`,
    );
  };
  const duplicate = (index: number): void => {
    const row = items[index];
    if (row === undefined) return;
    if (items.length >= queueMax) {
      setError(
        `${quoted(row.title)} wasn't duplicated: a queue holds at most ${String(queueMax)} topics. Remove one first.`,
      );
      return;
    }
    const [copy] = newKeys(1);
    if (copy !== undefined) focusKey.current = copy;
    void replace(
      insertedAt(items, index + 1, [row]),
      insertedAt(keys, index + 1, copy === undefined ? [] : [copy]),
      `Duplicated ${quoted(row.title)}.`,
    );
  };
  return {
    items,
    keys,
    saving,
    error,
    setError,
    focusKey,
    add,
    rename,
    move,
    remove,
    duplicate,
  };
}
