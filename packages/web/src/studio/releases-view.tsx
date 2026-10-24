import type { CalendarEntry } from "@app/slices/studio/calendar.js";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { PlusIcon } from "lucide-react";
import { type ReactElement, useState } from "react";
import { readReleaseCalendar } from "@/api";
import { useApp } from "@/app-context";
import { Button } from "@/components/kit/button";
import { EmptyState } from "@/components/kit/empty-state";
import { ButtonLink } from "@/components/kit/link";
import { schedulesQuery } from "@/schedules/api";
import { requestNewSchedule } from "@/schedules/new-from";
import {
  day,
  type Editing,
  FreeShorts,
  FreeTime,
  ItemCell,
  releasesKey,
  Unscheduled,
  weekOf,
  when,
} from "./release-cells.js";
import { inWindow, releaseWindow } from "./release-window.js";

export { releasesKey };

// Calendar → Releases: each long video due in the coming two weeks on one line, with its shorts
// beside it, every item with its release, the time it must be uploaded and scheduled by (so
// YouTube's checks finish while it is private) and where it stands. A free time of the posting
// plan offers the finished projects of its series. Any time can be moved, and a long video set
// to "not scheduled". Earlier and Later page through the next eight weeks, two at a time. Under
// the weeks, every finished video that has no release time yet, each with a way to give it one.

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
  const schedules = useQuery(schedulesQuery(api));
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
  const hasSchedule = (schedules.data ?? []).some((one) => one.deletedAt === null);
  // Release times come from a schedule's own Release times; with none, the first step is one.
  // With finished videos waiting below, giving one a time is nearer, so this steps back then.
  const setUp = (
    <ButtonLink
      to="/calendar"
      search={{ tab: "schedules" }}
      variant={data.candidates.length === 0 ? "primary" : "secondary"}
      onClick={hasSchedule ? undefined : () => requestNewSchedule()}
    >
      {hasSchedule ? null : <PlusIcon aria-hidden="true" strokeWidth={1.75} />}
      {hasSchedule ? "Set release times in a schedule" : "New schedule"}
    </ButtonLink>
  );
  return (
    <div className="flex flex-col gap-4">
      <nav aria-label="Release weeks" className="flex flex-wrap items-center gap-2">
        {view.hasEarlier ? (
          <Button size="small" onClick={() => setPage(page - 1)}>
            Earlier
          </Button>
        ) : null}
        <span className="text-small text-ink-2" role="status">
          {range}
        </span>
        {view.hasLater ? (
          <Button size="small" onClick={() => setPage(page + 1)}>
            Later
          </Button>
        ) : null}
        {page === 0 ? null : (
          <Button size="small" variant="quiet" onClick={() => setPage(0)}>
            Back to this week
          </Button>
        )}
      </nav>
      {entries.length === 0 ? (
        page === 0 ? (
          <EmptyState title="No release times in the next two weeks" actions={setUp}>
            A schedule can give each video it makes a day and time to go public: open it, press
            Edit, then Release times.
            {data.candidates.length === 0 ? "" : " Or pick a time for a finished video below."}
          </EmptyState>
        ) : (
          <EmptyState title={`Nothing planned from ${range}`}>
            Press Later to look further ahead, or Back to this week.
          </EmptyState>
        )
      ) : null}
      {[...weeks.values()].map((week) => (
        <section key={week.label} aria-label={week.label} className="flex flex-col gap-3">
          <h2 className="sl-section-head__title m-0">{week.label}</h2>
          <ul className="m-0 flex list-none flex-col gap-4 p-0">
            {week.entries.map((entry) => {
              const long = entry.items.find((item) => item.short === 0);
              const zone = entry.timeZone ?? data.timeZone;
              const shorts = entry.items.filter((item) => item.short > 0);
              return (
                <li
                  key={`${entry.at}-${entry.project?.id ?? "free"}`}
                  className="flex flex-col gap-2 border-b border-line pb-4"
                >
                  <div className="flex flex-wrap items-baseline gap-x-3">
                    <span className="font-semibold">{when(entry.at, zone)}</span>
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
                    <>
                      <FreeShorts entry={entry} zone={zone} />
                      <FreeTime entry={entry} zone={zone} candidates={data.candidates} />
                    </>
                  ) : (
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-x-4 gap-y-3">
                      {long === undefined ? null : (
                        <ItemCell
                          item={long}
                          zone={zone}
                          projectId={entry.project.id}
                          editing={editing}
                          onEdit={setEditing}
                        />
                      )}
                      {shorts.map((item) => (
                        <ItemCell
                          key={item.short}
                          item={item}
                          zone={zone}
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
      <Unscheduled
        candidates={data.candidates}
        zone={data.timeZone}
        editing={editing}
        onEdit={setEditing}
      />
      <p className="m-0 max-w-[90ch] text-small text-ink-2">
        Every video and short is due {String(data.leadHours)} hours before its release, so YouTube's
        copyright and ad checks finish while it is private. Change that in{" "}
        <Link to="/settings" search={{ section: "studio" }}>
          Settings → YouTube Studio and posting
        </Link>
        .
      </p>
    </div>
  );
}
