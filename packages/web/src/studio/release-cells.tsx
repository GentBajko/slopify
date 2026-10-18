import type { CalendarEntry, CalendarItem, ReleaseCalendar } from "@app/slices/studio/calendar.js";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type ReactElement, useState } from "react";
import { saveRelease } from "@/api";
import { useApp } from "@/app-context";
import { Button } from "@/components/kit/button";
import { Input, Select } from "@/components/kit/field";
import { Badge, type BadgeTone } from "@/components/kit/status";
import { useToast } from "@/components/kit/toast";
import { browserZone, zoneDiffers, zonedFormat, zonedTime, zoneName } from "@/lib/zoned";
import { keys } from "@/queries";
import { localScheduleTime, scheduleInstant } from "@/schedules/time";

// The pieces of Calendar → Releases: a release time and its state, its editor, and a free time
// of the posting plan offering the finished projects of its series.

export const releasesKey = keys.studioReleases;

export const day = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  day: "numeric",
  month: "short",
});
// On the clock of the line's zone (its schedule's), named when it isn't this browser's.
export const when = (iso: string, zone?: string) =>
  `${zonedFormat(iso, zone, { weekday: "short", day: "numeric", month: "short" })}, ${zonedTime(iso, zone)}`;

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
  zone,
  onDone,
}: {
  readonly item: CalendarItem;
  readonly projectId: string;
  readonly zone: string;
  readonly onDone: () => void;
}): ReactElement {
  const { api } = useApp();
  const client = useQueryClient();
  const notify = useToast();
  const [value, setValue] = useState(item.at === null ? "" : localScheduleTime(item.at, zone));
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
      {zoneDiffers(new Date().toISOString(), zone) ? (
        <span className="text-small text-ink-3">{`${zoneName(zone)} time`}</span>
      ) : null}
      <Button
        type="button"
        size="small"
        disabled={value === "" || save.isPending}
        onClick={() => {
          try {
            save.mutate(scheduleInstant(value, zone));
          } catch (error) {
            notify(
              `The time wasn't changed: ${error instanceof Error ? error.message : String(error)}`,
              "error",
            );
          }
        }}
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
  zone,
  editing,
  onEdit,
}: {
  readonly item: CalendarItem;
  readonly projectId: string;
  // The zone the line's times are read in.
  readonly zone?: string | undefined;
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
        <TimeEditor
          item={item}
          projectId={projectId}
          zone={zone ?? browserZone()}
          onDone={() => onEdit(undefined)}
        />
      ) : (
        <Button
          type="button"
          size="small"
          variant="quiet"
          aria-label={`${label}: move from ${item.at === null ? "no time" : when(item.at, zone)}`}
          onClick={() => onEdit({ projectId, short: item.short })}
        >
          {item.at === null ? "Set a time" : when(item.at, zone)}
        </Button>
      )}
      <Badge tone={state.tone}>{state.word}</Badge>
    </div>
  );
}

// A free time's short times, as the plan would give them: "Shorts: Wed, Oct 21, 12:00 PM · …".
export function FreeShorts({
  entry,
  zone,
}: {
  readonly entry: CalendarEntry;
  readonly zone: string | undefined;
}): ReactElement | null {
  const shorts = entry.shortsAt ?? [];
  if (shorts.length === 0) return null;
  return (
    <span className="text-small text-ink-3">
      {`${shorts.length === 1 ? "Short" : "Shorts"}: ${shorts.map((at) => when(at, zone)).join(" · ")}`}
    </span>
  );
}

export function FreeTime({
  entry,
  zone,
  candidates,
}: {
  readonly entry: CalendarEntry;
  readonly zone?: string | undefined;
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
        aria-label={`Project for ${when(entry.at, zone)}`}
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
