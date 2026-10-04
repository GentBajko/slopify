import type { CalendarEntry } from "@app/slices/studio/calendar.js";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { type ReactElement, useState } from "react";
import { readReleaseCalendar } from "@/api";
import { useApp } from "@/app-context";
import { Button, ButtonRow } from "@/components/kit/button";
import { EmptyState } from "@/components/kit/empty-state";
import {
  day,
  type Editing,
  FreeTime,
  ItemCell,
  releasesKey,
  weekOf,
  when,
} from "./release-cells.js";
import { inWindow, maxWeeks, releaseWindow } from "./release-window.js";

export { releasesKey };

// Calendar → Releases: each long video due in the coming two weeks on one line, with its shorts
// beside it, every item with its release, the time it must be uploaded and scheduled by (so
// YouTube's checks finish while it is private) and where it stands. A free time of the posting
// plan offers the finished projects of its series. Any time can be moved, and a long video set
// to "not scheduled". Earlier and Later page through the next eight weeks, two at a time.

export function ReleasesView(): ReactElement {
  const { api } = useApp();
  const [page, setPage] = useState(0);
  const [now] = useState(() => new Date());
  const view = releaseWindow(page, now);
  const calendar = useQuery({
    queryKey: [...releasesKey, view.weeks],
    queryFn: () => readReleaseCalendar(api, view.weeks),
    placeholderData: (previous) => previous,
  });
  const [editing, setEditing] = useState<Editing | undefined>();
  if (calendar.isPending) return <p className="text-small text-ink-3">Loading the releases…</p>;
  if (calendar.isError)
    return (
      <p className="text-small text-danger">
        The releases didn't load: {calendar.error.message} Reload the page to try again.
      </p>
    );
  const data = calendar.data;
  const entries = inWindow(data.entries, view);
  const range =
    page === 0
      ? "The next two weeks"
      : `${day.format(view.start ?? now)} to ${day.format(view.end)}`;
  const weeks = new Map<string, { label: string; entries: CalendarEntry[] }>();
  for (const entry of entries) {
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
      <nav aria-label="Release weeks" className="flex flex-wrap items-center gap-3">
        <ButtonRow>
          <Button
            size="small"
            disabled={!view.hasEarlier}
            disabledReason="Releases already public are not listed here; open the project to see its release."
            onClick={() => setPage(page - 1)}
          >
            Earlier
          </Button>
          <Button
            size="small"
            disabled={!view.hasLater}
            disabledReason={`Releases are listed up to ${String(maxWeeks)} weeks ahead.`}
            onClick={() => setPage(page + 1)}
          >
            Later
          </Button>
          {page === 0 ? null : (
            <Button size="small" variant="quiet" onClick={() => setPage(0)}>
              Back to this week
            </Button>
          )}
        </ButtonRow>
        <span className="text-small text-ink-2" role="status">
          {range}
        </span>
      </nav>
      {entries.length === 0 ? (
        page === 0 ? (
          <EmptyState title="No releases in the next two weeks">
            Add your week in Settings → YouTube Studio → Posting plan: each finished project then
            takes its next free time, and its shorts the times after it. Or open a finished
            project's Prepare upload, or press Later to look further ahead.
          </EmptyState>
        ) : (
          <EmptyState title={`No releases from ${range}`}>
            Nothing is planned in these weeks yet. Press Back to this week, or Earlier.
          </EmptyState>
        )
      ) : null}
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
