import type { CalendarEntry, CalendarItem, ReleaseCalendar } from "@app/slices/studio/calendar.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { type ReactElement, useState } from "react";
import { readReleaseCalendar, saveRelease } from "@/api";
import { useApp } from "@/app-context";
import { Button } from "@/components/kit/button";
import { EmptyState } from "@/components/kit/empty-state";
import { Input, Select } from "@/components/kit/field";
import { Badge, type BadgeTone } from "@/components/kit/status";
import { useToast } from "@/components/kit/toast";

// Calendar → Releases: each long video due in the coming two weeks on one line, with its shorts
// beside it, every item with its release, the time it must be uploaded and scheduled by (so
// YouTube's checks finish while it is private) and where it stands. A free time of the posting
// plan offers the finished projects of its series. Any time can be moved, and a long video set
// to "not scheduled".

export const releasesKey = ["studio", "releases"] as const;

const day = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  day: "numeric",
  month: "short",
});
const clock = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" });
const when = (iso: string) => `${day.format(new Date(iso))}, ${clock.format(new Date(iso))}`;

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
      // Ready to upload now; the deadline is only the latest time, so it turns orange only in
      // its last day.
      return item.uploadBy === null
        ? { tone: "neutral", word: "No time" }
        : Date.parse(item.uploadBy) - Date.now() < 864e5
          ? { tone: "waiting", word: `Upload soon · before ${when(item.uploadBy)}` }
          : { tone: "neutral", word: `Ready · upload before ${when(item.uploadBy)}` };
  }
}

// Monday of the week the time falls in, as a key and a heading.
function weekOf(iso: string, now: Date): { readonly key: string; readonly label: string } {
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

interface Editing {
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

function ItemCell({
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

function FreeTime({
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

export function ReleasesView(): ReactElement {
  const { api } = useApp();
  const calendar = useQuery({ queryKey: releasesKey, queryFn: () => readReleaseCalendar(api) });
  const [editing, setEditing] = useState<Editing | undefined>();
  if (calendar.isPending) return <p className="text-small text-ink-3">Loading the releases…</p>;
  if (calendar.isError)
    return (
      <p className="text-small text-danger">
        The releases didn't load: {calendar.error.message} Reload the page to try again.
      </p>
    );
  const data = calendar.data;
  if (data.entries.length === 0)
    return (
      <EmptyState title="No releases in the next two weeks">
        Add your week in Settings → YouTube Studio → Posting plan: each finished project then takes
        its next free time, and its shorts the times after it. Or open a finished project's Prepare
        upload.
      </EmptyState>
    );
  const now = new Date();
  const weeks = new Map<string, { label: string; entries: CalendarEntry[] }>();
  for (const entry of data.entries) {
    const week = weekOf(entry.at, now);
    const group = weeks.get(week.key) ?? { label: week.label, entries: [] };
    group.entries.push(entry);
    weeks.set(week.key, group);
  }
  return (
    <div className="flex flex-col gap-6">
      <p className="m-0 text-small text-ink-2">
        Every video and short is due {String(data.leadHours)} hours before its release, so YouTube's
        copyright and ad checks finish while it is private. Change that, or the weekly times, in{" "}
        <Link to="/settings" search={{ section: "studio" }}>
          Settings → YouTube Studio
        </Link>
        .
      </p>
      {[...weeks.values()].map((week) => (
        <section key={week.label} aria-label={week.label} className="flex flex-col gap-3">
          <h2 className="sl-section-head__title m-0">{week.label}</h2>
          <ul className="m-0 flex list-none flex-col gap-4 p-0">
            {week.entries.map((entry) => {
              const long = entry.items.find((item) => item.short === 0);
              const shorts = entry.items.filter((item) => item.short > 0);
              return (
                <li
                  key={`${entry.at}-${entry.project?.id ?? "free"}`}
                  className="flex flex-col gap-2 border-b border-line pb-4"
                >
                  <div className="flex flex-wrap items-baseline gap-x-3">
                    <span className="font-semibold">{when(entry.at)}</span>
                    {entry.series === "" ? null : (
                      <span className="text-small text-ink-3">{entry.series}</span>
                    )}
                    {entry.project === null ? null : (
                      <Link to="/projects/$projectId" params={{ projectId: entry.project.id }}>
                        {entry.project.title}
                      </Link>
                    )}
                  </div>
                  {entry.project === null ? (
                    <FreeTime entry={entry} candidates={data.candidates} />
                  ) : (
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-x-4 gap-y-3">
                      {long === undefined ? null : (
                        <ItemCell
                          item={long}
                          projectId={entry.project.id}
                          editing={editing}
                          onEdit={setEditing}
                        />
                      )}
                      {shorts.map((item) => (
                        <ItemCell
                          key={item.short}
                          item={item}
                          projectId={entry.project?.id ?? ""}
                          editing={editing}
                          onEdit={setEditing}
                        />
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
