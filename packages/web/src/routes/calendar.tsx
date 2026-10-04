import type { Calendar, CalendarRun } from "@app/slices/schedules/schema.js";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ChevronLeftIcon, ChevronRightIcon, PlusIcon } from "lucide-react";
import { type ReactElement, useMemo, useState } from "react";
import { useApp } from "@/app-context";
import { AddToCalendar } from "@/calendar/add-topics";
import { attentionMeta, needingAttention } from "@/calendar/attention";
import { DayCell } from "@/calendar/day-cell";
import { ListView } from "@/calendar/list-view";
import {
  byDay,
  type Day,
  type Drop,
  dayKey,
  neighbour,
  planDrop,
  rangeOf,
  runTitle,
  weekDays,
} from "@/calendar/plan";
import { SuggestedTopics, suggesting } from "@/calendar/suggestions";
import { useCalendarMoves } from "@/calendar/use-moves";
import { useCurrentChannel } from "@/channels/current";
import { QueueItemActions } from "@/components/batch-queue";
import { StatusSlot } from "@/components/kit/action-bar";
import { Button } from "@/components/kit/button";
import { useCommand } from "@/components/kit/command-palette";
import { PageHeader } from "@/components/kit/layout";
import { TextLink } from "@/components/kit/link";
import { List, ListRow } from "@/components/kit/list-row";
import { LoadFailed, LoadingBlock, StaleNote } from "@/components/kit/query-state";
import { SectionHead } from "@/components/kit/section-head";
import { Status } from "@/components/kit/status";
import { Segmented } from "@/components/kit/switch";
import { TabPanel, Tabs } from "@/components/kit/tabs";
import { intents, useIntent } from "@/lib/intents";
import { projectsQuery } from "@/queries";
import { calendarQuery, schedulesQuery } from "@/schedules/api";
import { SchedulesView } from "@/schedules/view";
import { ReleasesView } from "@/studio/releases-view";
import { templatesQuery } from "@/templates/api";

const weeks = 4;
type View = "weeks" | "list";

// The calendar's tabs: the coming weeks, the YouTube releases (`studio/releases-view.tsx`), and
// the schedules that fill them. Only the other tabs show in the URL (`?tab=releases`), so
// `/calendar` stays the weeks.
export const calendarTabs = ["weeks", "releases", "schedules"] as const;
export type CalendarTab = (typeof calendarTabs)[number];

export function calendarTabOf(value: unknown): CalendarTab {
  return value === "schedules" ? "schedules" : value === "releases" ? "releases" : "weeks";
}

const fullDay = new Intl.DateTimeFormat(undefined, { dateStyle: "full" });
const shortDay = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" });
const dayMs = 24 * 60 * 60_000;

const viewKey = "slopify.calendar.view";

function storedView(): View {
  try {
    return window.localStorage.getItem(viewKey) === "list" ? "list" : "weeks";
  } catch {
    return "weeks";
  }
}

// The coming four weeks on one screen: every scheduled run with the topic it will use, the
// projects running or finished, and the batch queue. A topic is dragged to another day (or
// moved with Alt+arrow keys, or the list view's buttons) to change when it runs, or dropped
// on another schedule's run to move it there. Suggested topics wait beside it. The Schedules
// tab holds every schedule, its detail and New schedule (`schedules/view.tsx`); `/schedules`
// redirects there. Without `onTab` (a test rendering the screen alone) the tab lives here.
export function CalendarRoute({
  tab: tabProp,
  schedule,
  onTab,
  onSchedule,
}: {
  readonly tab?: CalendarTab | undefined;
  // The schedule picked on the Schedules tab.
  readonly schedule?: string | undefined;
  readonly onTab?: ((tab: CalendarTab) => void) | undefined;
  readonly onSchedule?: ((scheduleId: string) => void) | undefined;
} = {}): ReactElement {
  const { api } = useApp();
  const current = useCurrentChannel();
  // The window starts on this week's Monday; Earlier and Later step it four weeks at a time.
  const [shift, setShift] = useState(0);
  const range = useMemo(
    () => rangeOf(new Date(Date.now() + shift * weeks * 7 * dayMs), weeks),
    [shift],
  );
  const [view, setView] = useState<View>(storedView);
  const [ownTab, setOwnTab] = useState<CalendarTab>(tabProp ?? "weeks");
  const tab = onTab === undefined ? ownTab : (tabProp ?? "weeks");
  const chooseTab = (next: CalendarTab) => {
    if (onTab === undefined) setOwnTab(next);
    else onTab(next);
  };
  const [adding, setAdding] = useState(false);
  const calendar = useQuery(calendarQuery(api, range.from, range.to));
  const schedules = useQuery(schedulesQuery(api));
  const templates = useQuery(templatesQuery(api));
  const projects = useQuery(projectsQuery(api));
  const [message, setMessage] = useState<string | null>(null);
  const [dragging, setDragging] = useState<CalendarRun | null>(null);

  const templateChannel = useMemo(
    () => new Map((templates.data ?? []).map((one) => [one.id, one.channelId])),
    [templates.data],
  );
  const projectChannel = useMemo(
    () => new Map((projects.data?.projects ?? []).map((one) => [one.id, one.channelId])),
    [projects.data],
  );
  const mySchedules = (schedules.data ?? []).filter((one) =>
    current.includes(templateChannel.get(one.templateId)),
  );
  const visible: Calendar | undefined =
    calendar.data === undefined
      ? undefined
      : {
          ...calendar.data,
          runs: calendar.data.runs.filter((run) =>
            current.includes(templateChannel.get(run.templateId)),
          ),
          projects: calendar.data.projects.filter((project) =>
            current.includes(projectChannel.get(project.id)),
          ),
        };
  const days = useMemo(
    () => (visible === undefined ? new Map<string, Day>() : byDay(visible)),
    [visible],
  );
  const allRuns = visible?.runs ?? [];
  const attention = needingAttention(visible?.projects ?? []);

  const action = useCalendarMoves(calendarQuery(api, range.from, range.to).queryKey, setMessage);

  const apply = (drop: Drop, title: string, where: string) => {
    if (drop.kind === "none") return;
    if (drop.kind === "refused") {
      setMessage(drop.message);
      return;
    }
    action.mutate({ drop, title, where });
  };
  const step = (run: CalendarRun, by: -1 | 1) => {
    const target = neighbour(allRuns, run, by);
    if (target === undefined) {
      setMessage(
        by === -1
          ? `${runTitle(run)} is already the next topic of ${run.scheduleName}.`
          : `${runTitle(run)} is the last topic on the calendar for ${run.scheduleName}. Show Later weeks to move it further.`,
      );
      return;
    }
    const day = fullDay.format(new Date(target.at));
    apply(planDrop(run, target, day), runTitle(run), day);
  };
  const chooseView = (next: View) => {
    setView(next);
    if (tab !== "weeks") chooseTab("weeks");
    try {
      window.localStorage.setItem(viewKey, next);
    } catch {
      // The choice lasts until the page reloads.
    }
  };

  useCommand({
    id: "calendar.add",
    title: "Add to calendar",
    group: "Calendar",
    keywords: ["topics", "batch", "queue"],
    run: () => setAdding(true),
  });
  useCommand({
    id: "calendar.schedules",
    title: "Show the schedules",
    group: "Calendar",
    keywords: ["edit", "recurring", "pause", "resume"],
    run: () => chooseTab("schedules"),
  });
  // "Add to calendar" run from another screen lands here (`components/global-commands.tsx`).
  useIntent(intents.addToCalendar, () => setAdding(true));
  useCommand({
    id: "calendar.weeks",
    title: "Show the calendar as weeks",
    group: "Calendar",
    run: () => chooseView("weeks"),
  });
  useCommand({
    id: "calendar.list",
    title: "Show the calendar as a list",
    group: "Calendar",
    run: () => chooseView("list"),
  });

  const queued = mySchedules.reduce(
    (sum, one) => sum + (one.deletedAt === null ? one.items.length : 0),
    0,
  );
  // The status slot is for what the person just did; a failed load says so in place, with Retry.
  const today = dayKey(new Date());
  const windowLabel = `${shortDay.format(new Date(range.from))} to ${shortDay.format(new Date(Date.parse(range.to) - 2 * dayMs))}`;
  const waiting = (visible?.queued ?? []).toSorted((a, b) => a.position - b.position);
  const stillWaiting = waiting.filter((item) => item.state === "queued");
  const liveSchedules = (schedules.data ?? []).filter((one) => one.deletedAt === null).length;

  return (
    <div data-tour="calendar">
      <PageHeader
        title="Calendar"
        meta={`${current.channel?.name ?? "Every channel"} · ${String(allRuns.length)} scheduled ${allRuns.length === 1 ? "run" : "runs"} ${shift === 0 ? `in the next ${String(weeks)} weeks` : windowLabel} · ${String(queued)} ${queued === 1 ? "topic" : "topics"} queued`}
        actions={
          tab !== "weeks" ? undefined : (
            <>
              <Segmented
                label="Calendar view"
                tip="planning.calendar.view"
                value={view}
                onChange={chooseView}
                options={[
                  { value: "weeks", label: "Weeks" },
                  { value: "list", label: "List" },
                ]}
              />
              <Button variant="primary" onClick={() => setAdding(true)}>
                <PlusIcon aria-hidden="true" strokeWidth={1.75} />
                Add to calendar
              </Button>
            </>
          )
        }
      />
      <Tabs
        items={[
          { id: "weeks", label: "Coming weeks" },
          { id: "releases", label: "Releases" },
          {
            id: "schedules",
            label: "Schedules",
            ...(schedules.data === undefined ? {} : { badge: String(liveSchedules) }),
          },
        ]}
        value={tab}
        onChange={chooseTab}
        label="Calendar sections"
        idPrefix="calendar"
        className="mb-6"
      />
      <TabPanel idPrefix="calendar" id="releases" active={tab === "releases"}>
        {tab === "releases" ? <ReleasesView /> : null}
      </TabPanel>
      <TabPanel idPrefix="calendar" id="schedules" active={tab === "schedules"}>
        {tab === "schedules" ? <SchedulesView pickedId={schedule} onPick={onSchedule} /> : null}
      </TabPanel>
      <TabPanel idPrefix="calendar" id="weeks" active={tab === "weeks"}>
        <StatusSlot tone={message === null ? "info" : "error"} className="mb-3">
          {message ?? undefined}
        </StatusSlot>
        {calendar.data === undefined ? null : calendar.error === null ? null : (
          <div className="mb-3">
            <StaleNote
              what="the calendar"
              error={calendar.error}
              updatedAt={calendar.dataUpdatedAt}
              onRetry={() => void calendar.refetch()}
              retrying={calendar.isFetching}
            />
          </div>
        )}
        {calendar.data === undefined && calendar.error !== null ? (
          <LoadFailed
            what="The calendar"
            error={calendar.error}
            onRetry={() => void calendar.refetch()}
            retrying={calendar.isFetching}
          />
        ) : (
          <>
            {/* What needs a decision is Home's list; the calendar only says how much and links
                there, and keeps its own space for what is planned. */}
            {visible === undefined || attention.length === 0 ? null : (
              <p className="m-0 mb-4 text-small text-ink-2">
                {attentionMeta(attention)}. <TextLink to="/">Open Home</TextLink> to act on them.
              </p>
            )}
            {schedules.data !== undefined && suggesting(mySchedules).length === 0 ? null : (
              <section aria-label="Suggested topics" className="mb-6 min-w-0">
                {schedules.data === undefined && schedules.error !== null ? (
                  <LoadFailed
                    compact
                    what="Your schedules"
                    error={schedules.error}
                    onRetry={() => void schedules.refetch()}
                    retrying={schedules.isFetching}
                  />
                ) : (
                  <SuggestedTopics schedules={mySchedules} />
                )}
              </section>
            )}
            {/* The weeks take the page's full width: seven days side by side need it. */}
            <section aria-label="Coming weeks" className="flex min-w-0 flex-col gap-4">
              <WindowSteps
                label={windowLabel}
                shift={shift}
                onShift={(by) => setShift((now) => (by === 0 ? 0 : now + by))}
              />
              {calendar.data === undefined ? (
                <LoadingBlock label="Loading the calendar…" rows={2} rowClassName="h-40" />
              ) : view === "weeks" ? (
                <>
                  <p className="m-0 text-small text-ink-2">
                    Drag a topic by its grip to another day to change when it runs, or onto another
                    schedule's run to move it there. With the keyboard: focus a topic and press
                    Alt+← or Alt+→.
                  </p>
                  {weekDays(new Date(range.from), weeks).map((week) => (
                    <div key={dayKey(week[0] ?? new Date())} className="sl-cal-week">
                      {week.map((date) => {
                        const key = dayKey(date);
                        const day = days.get(key);
                        return (
                          <DayCell
                            key={key}
                            date={date}
                            today={key === today}
                            day={day}
                            dragging={dragging}
                            busy={action.isPending}
                            onDragStart={setDragging}
                            onDragEnd={() => setDragging(null)}
                            onDrop={(target) => {
                              if (dragging === null) return;
                              apply(
                                planDrop(dragging, target, fullDay.format(date)),
                                runTitle(dragging),
                                fullDay.format(date),
                              );
                              setDragging(null);
                            }}
                            onStep={step}
                          />
                        );
                      })}
                    </div>
                  ))}
                </>
              ) : (
                <ListView
                  days={days}
                  busy={action.isPending}
                  onStep={step}
                  schedules={mySchedules}
                  onMove={(run, target) => {
                    const day = fullDay.format(new Date(target.at));
                    apply(planDrop(run, target, day), runTitle(run), day);
                  }}
                  onTransfer={(run, targetId) => {
                    // To the end of the other schedule's queue.
                    if (run.index !== null)
                      apply(
                        {
                          kind: "transfer",
                          scheduleId: run.scheduleId,
                          baseVersion: run.scheduleVersion,
                          index: run.index,
                          targetId,
                          position: undefined,
                        },
                        runTitle(run),
                        `the end of ${mySchedules.find((one) => one.id === targetId)?.name ?? "the other schedule"}`,
                      );
                  }}
                />
              )}
              {visible !== undefined && visible.queued.length > 0 ? (
                <section aria-label="Batch queue">
                  <SectionHead
                    title="Batch queue"
                    meta={`${String(visible.queued.length)} waiting to start`}
                    info="play.queue"
                  />
                  <List label="Batch queue">
                    {waiting.map((item, index) => {
                      // Pausing a queued project holds the whole queue, so it says so.
                      const paused =
                        visible.projects.find((one) => one.id === item.projectId)?.state ===
                        "paused";
                      return (
                        <ListRow
                          key={item.projectId}
                          title={
                            <Link to="/projects/$projectId" params={{ projectId: item.projectId }}>
                              {item.title}
                            </Link>
                          }
                          meta={`${String(index + 1)} in line`}
                          actions={
                            <>
                              <Status
                                tone={
                                  paused ? "waiting" : item.state === "active" ? "running" : "off"
                                }
                              >
                                {paused
                                  ? "Paused"
                                  : item.state === "active"
                                    ? "Running now"
                                    : "Waiting its turn"}
                              </Status>
                              {item.state === "queued" ? (
                                <QueueItemActions
                                  projectId={item.projectId}
                                  title={item.title}
                                  place={stillWaiting.indexOf(item)}
                                  waiting={stillWaiting.length}
                                />
                              ) : null}
                            </>
                          }
                        />
                      );
                    })}
                  </List>
                </section>
              ) : null}
            </section>
          </>
        )}
      </TabPanel>
      <AddToCalendar open={adding} onOpenChange={setAdding} schedules={mySchedules} />
    </div>
  );
}

// Earlier and Later move the weeks shown four at a time; This week comes back.
function WindowSteps({
  label,
  shift,
  onShift,
}: {
  readonly label: string;
  readonly shift: number;
  readonly onShift: (by: -1 | 0 | 1) => void;
}): ReactElement {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="small" variant="secondary" onClick={() => onShift(-1)}>
        <ChevronLeftIcon aria-hidden="true" strokeWidth={1.75} />
        Earlier
      </Button>
      <span className="text-small text-ink-2 tabular-nums" aria-live="polite">
        {label}
      </span>
      <Button size="small" variant="secondary" onClick={() => onShift(1)}>
        Later
        <ChevronRightIcon aria-hidden="true" strokeWidth={1.75} />
      </Button>
      <Button size="small" variant="quiet" disabled={shift === 0} onClick={() => onShift(0)}>
        This week
      </Button>
    </div>
  );
}
