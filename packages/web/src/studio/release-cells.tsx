import type { CalendarEntry, CalendarItem, ReleaseCalendar } from "@app/slices/studio/calendar.js";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type ReactElement, useState } from "react";
import { saveRelease } from "@/api";
import { useApp } from "@/app-context";
import { Button } from "@/components/kit/button";
import { Input, Select } from "@/components/kit/field";
import { Badge, type BadgeTone } from "@/components/kit/status";
import { useToast } from "@/components/kit/toast";

// The pieces of Calendar → Releases: a release time and its state, its editor, and a free time
// of the posting plan offering the finished projects of its series.

export const releasesKey = ["studio", "releases"] as const;

export const day = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  day: "numeric",
  month: "short",
});
const clock = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" });
export const when = (iso: string) => `${day.format(new Date(iso))}, ${clock.format(new Date(iso))}`;

// "2026-10-04T20:00" in this browser's zone, for a datetime-local input.
function localInput(iso: string): string {
  const at = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${String(at.getFullYear())}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T${pad(at.getHours())}:${pad(at.getMinutes())}`;
}

function look(item: CalendarItem): { readonly tone: BadgeTone; readonly word: string } {
  switch (item.state) {
    case "scheduled":
      return item.checks === "ok"
        ? { tone: "neutral", word: "✓ Scheduled · checks clear" }
        : item.checks === null
          ? { tone: "info", word: "✓ Scheduled · checks pending" }
          : { tone: "failed", word: `Scheduled · ${item.checks}` };
    case "filled":
      return { tone: "waiting", word: "Filled in Studio, not scheduled" };
    case "late":
      return { tone: "failed", word: "Late · upload now" };
    case "not-ready":
      return { tone: "neutral", word: "Not rendered yet" };
    default:
      // Ready: it can be uploaded and scheduled any time; only a late one is flagged.
      return { tone: "neutral", word: "Ready to upload" };
  }
}

// Monday of the week the time falls in, as a key and a heading.
export function weekOf(iso: string, now: Date): { readonly key: string; readonly label: string } {
  const at = new Date(iso);
  const monday = new Date(at.getFullYear(), at.getMonth(), at.getDate() - ((at.getDay() + 6) % 7));
  const thisMonday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - ((now.getDay() + 6) % 7),
  );
  const weeksAhead = Math.round((monday.getTime() - thisMonday.getTime()) / (7 * 864e5));
  return {
    key: monday.toISOString(),
    label:
      weeksAhead <= 0
        ? "This week"
        : weeksAhead === 1
          ? "Next week"
          : `Week of ${day.format(monday)}`,
  };
}

export interface Editing {
  readonly projectId: string;
  readonly short: number;
}

function TimeEditor({
  item,
  projectId,
  onDone,
}: {
  readonly item: CalendarItem;
  readonly projectId: string;
  readonly onDone: () => void;
}): ReactElement {
  const { api } = useApp();
  const client = useQueryClient();
  const notify = useToast();
  const [value, setValue] = useState(item.at === null ? "" : localInput(item.at));
  const save = useMutation({
    mutationFn: (at: string | null) => saveRelease(api, projectId, { short: item.short, at }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: releasesKey });
      onDone();
    },
    onError: (error: Error) => notify(`The time wasn't changed: ${error.message}`, "error"),
  });
  const label = item.short === 0 ? "Long video" : `Short ${String(item.short)}`;
  return (
    <span className="flex flex-wrap items-center gap-1">
      <Input
        aria-label={`${label}: release`}
        type="datetime-local"
        className="w-[200px]"
        value={value}
        onChange={(event) => setValue(event.currentTarget.value)}
      />
      <Button
        type="button"
        size="small"
        disabled={value === "" || save.isPending}
        onClick={() => save.mutate(new Date(value).toISOString())}
      >
        Save
      </Button>
      {item.short === 0 ? (
        <Button
          type="button"
          size="small"
          variant="quiet"
          disabled={save.isPending}
          onClick={() => save.mutate(null)}
        >
          Not scheduled
        </Button>
      ) : null}
      <Button type="button" size="small" variant="quiet" onClick={onDone}>
        Cancel
      </Button>
    </span>
  );
}

export function ItemCell({
  item,
  projectId,
  editing,
  onEdit,
}: {
  readonly item: CalendarItem;
  readonly projectId: string;
  readonly editing: Editing | undefined;
  readonly onEdit: (next: Editing | undefined) => void;
}): ReactElement {
  const state = look(item);
  const open = editing?.projectId === projectId && editing.short === item.short;
  const label = item.short === 0 ? "Long video" : `Short ${String(item.short)}`;
  return (
    <div className="flex min-w-0 flex-col items-start gap-1">
      <span className="text-small text-ink-3">
        {label}
        {item.at === null ? "" : " · goes public"}
      </span>
      {item.short === 0 ? null : (
        <span className="w-full truncate text-small" title={item.title}>
          {item.title}
        </span>
      )}
      {open ? (
        <TimeEditor item={item} projectId={projectId} onDone={() => onEdit(undefined)} />
      ) : (
        <Button
          type="button"
          size="small"
          variant="quiet"
          aria-label={`${label}: move from ${item.at === null ? "no time" : when(item.at)}`}
          onClick={() => onEdit({ projectId, short: item.short })}
        >
          {item.at === null ? "Set a time" : when(item.at)}
        </Button>
      )}
      <Badge tone={state.tone}>{state.word}</Badge>
    </div>
  );
}

export function FreeTime({
  entry,
  candidates,
}: {
  readonly entry: CalendarEntry;
  readonly candidates: ReleaseCalendar["candidates"];
}): ReactElement {
  const { api } = useApp();
  const client = useQueryClient();
  const notify = useToast();
  const fitting = candidates.filter(
    (candidate) => entry.series === "" || candidate.series === entry.series,
  );
  const [chosen, setChosen] = useState("");
  const put = useMutation({
    mutationFn: (projectId: string) =>
      saveRelease(api, projectId, {
        short: 0,
        at: entry.at,
        ...(entry.line === null ? {} : { line: entry.line }),
      }),
    onSuccess: () => void client.invalidateQueries({ queryKey: releasesKey }),
    onError: (error: Error) => notify(`The project wasn't put there: ${error.message}`, "error"),
  });
  if (fitting.length === 0)
    return (
      <span className="text-small text-ink-3">
        Free · no finished project{entry.series === "" ? "" : ` of ${entry.series}`} waits for a
        time
      </span>
    );
  return (
    <span className="flex flex-wrap items-center gap-2">
      <Select
        aria-label={`Project for ${when(entry.at)}`}
        className="w-[260px]"
        value={chosen}
        onChange={(event) => setChosen(event.currentTarget.value)}
        options={[
          { value: "", label: "Free · pick a finished project" },
          ...fitting.map((candidate) => ({ value: candidate.id, label: candidate.title })),
        ]}
      />
      <Button
        type="button"
        size="small"
        disabled={chosen === "" || put.isPending}
        onClick={() => put.mutate(chosen)}
      >
        Put it here
      </Button>
    </span>
  );
}
