import type { CalendarEntry, CalendarItem, ReleaseCalendar } from "@app/slices/studio/calendar.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { type ReactElement, useState } from "react";
import { saveRelease } from "@/api";
import { useApp } from "@/app-context";
import { finishedMeta } from "@/calendar/recent";
import { Button } from "@/components/kit/button";
import { Input, Select } from "@/components/kit/field";
import { List, ListRow } from "@/components/kit/list-row";
import { SectionHead } from "@/components/kit/section-head";
import { Status, type Tone } from "@/components/kit/status";
import { useToast } from "@/components/kit/toast";
import { ProjectThumb } from "@/home/project-thumb";
import { browserZone, zoneDiffers, zonedFormat, zonedTime, zoneName } from "@/lib/zoned";
import { uploadName } from "@/project/release-times";
import { keys, projectsQuery } from "@/queries";
import { localScheduleTime, scheduleInstant } from "@/schedules/time";

// The pieces of Calendar → Releases: a release time and its state, its editor, a free time of
// the posting plan offering the finished projects of its series, and the finished projects
// that have no time yet.

export const releasesKey = keys.studioReleases;

export const day = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  day: "numeric",
  month: "short",
});
// On the clock of the line's zone (its schedule's), named when it isn't this browser's.
export const when = (iso: string, zone?: string) =>
  `${zonedFormat(iso, zone, { weekday: "short", day: "numeric", month: "short" })}, ${zonedTime(iso, zone)}`;

// Where each upload stands, in the words the project's Release rows and Projects use, its lamp
// always beside its word: Uploaded (its link saved, or the project marked uploaded), Late, Ready
// to upload. YouTube's own checks are said only when they found something.
function look(item: CalendarItem): { readonly tone: Tone; readonly word: string } {
  switch (item.state) {
    case "scheduled":
      return item.checks === "ok" || item.checks === null
        ? { tone: "done", word: "Uploaded" }
        : { tone: "failed", word: `Uploaded · ${item.checks}` };
    case "filled":
      return { tone: "waiting", word: "Filled in Studio, not scheduled" };
    case "late":
      return { tone: "failed", word: "Late · upload now" };
    case "not-ready":
      return { tone: "off", word: "Not made yet" };
    default:
      // Ready: it can be uploaded and scheduled any time; only a late one is flagged.
      return { tone: "done", word: "Ready to upload" };
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

export function TimeEditor({
  item,
  projectId,
  zone,
  onDone,
  unschedule = true,
}: {
  readonly item: Pick<CalendarItem, "short" | "at">;
  readonly projectId: string;
  readonly zone: string;
  readonly onDone: () => void;
  // "Not scheduled" for a long video that has a time to take back.
  readonly unschedule?: boolean;
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
  const label = uploadName(item.short);
  const keep = () => {
    try {
      save.mutate(scheduleInstant(value, zone));
    } catch (error) {
      notify(
        `The time wasn't changed: ${error instanceof Error ? error.message : String(error)}`,
        "error",
      );
    }
  };
  return (
    <span className="flex flex-wrap items-center gap-1">
      <Input
        aria-label={`${label}: release`}
        type="datetime-local"
        className="w-[200px]"
        value={value}
        onChange={(event) => setValue(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && value !== "" && !save.isPending) {
            event.preventDefault();
            keep();
          }
        }}
      />
      {zoneDiffers(new Date().toISOString(), zone) ? (
        <span className="text-small text-ink-3">{`${zoneName(zone)} time`}</span>
      ) : null}
      {/* Offered once a time is picked (Enter saves it too), not drawn greyed before. */}
      {value === "" ? null : (
        <Button
          type="button"
          size="small"
          disabled={save.isPending}
          disabledReason="Saving…"
          onClick={keep}
        >
          Save
        </Button>
      )}
      {item.short === 0 && unschedule ? (
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
  const label = uploadName(item.short);
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
          {item.at === null ? "Set the date" : when(item.at, zone)}
        </Button>
      )}
      <Status tone={state.tone} className="text-small">
        {state.word}
      </Status>
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

// Finished videos with no release date yet, each with its picture, what it is and when it
// finished, and a way to give it one; a time saved moves it up into its week.
export function Unscheduled({
  candidates,
  zone,
  editing,
  onEdit,
}: {
  readonly candidates: ReleaseCalendar["candidates"];
  readonly zone: string;
  readonly editing: Editing | undefined;
  readonly onEdit: (next: Editing | undefined) => void;
}): ReactElement | null {
  const { api } = useApp();
  // The calendar has the list already; it adds the shape and the day each one finished.
  const projects = useQuery(projectsQuery(api));
  const listed = new Map((projects.data?.projects ?? []).map((one) => [one.id, one]));
  if (candidates.length === 0) return null;
  return (
    <section aria-label="Finished, no date yet" className="flex flex-col gap-2">
      <SectionHead
        title="Finished, no date yet"
        meta={`${String(candidates.length)} ${candidates.length === 1 ? "video" : "videos"} · pick when each goes public`}
        className="mb-0"
      />
      <List label="Finished, no date yet">
        {candidates.map((candidate) => (
          <ListRow
            key={candidate.id}
            lead={<ProjectThumb projectId={candidate.id} className="w-[96px] shrink-0" />}
            title={
              <Link to="/projects/$projectId" params={{ projectId: candidate.id }}>
                {candidate.title}
              </Link>
            }
            meta={meta(candidate.series, listed.get(candidate.id))}
            actions={
              editing?.projectId === candidate.id ? (
                <TimeEditor
                  item={{ short: 0, at: null }}
                  projectId={candidate.id}
                  zone={zone}
                  unschedule={false}
                  onDone={() => onEdit(undefined)}
                />
              ) : (
                <Button
                  size="small"
                  aria-label={`Set the date for ${candidate.title}`}
                  onClick={() => onEdit({ projectId: candidate.id, short: 0 })}
                >
                  Set the date
                </Button>
              )
            }
          />
        ))}
      </List>
    </section>
  );
}

// "Sleep lore · 3:05 · 16:9 · video + 2 shorts · finished Sep 27": the series when it has one,
// then its length, what it is and when it finished.
function meta(
  series: string,
  project: Parameters<typeof finishedMeta>[0] | undefined,
): string | undefined {
  const parts = [
    series === "" ? undefined : series,
    project === undefined ? undefined : finishedMeta(project),
  ].filter((part) => part !== undefined);
  return parts.length === 0 ? undefined : parts.join(" · ");
}
