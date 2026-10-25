import type { Calendar, CalendarRun } from "@app/slices/schedules/schema.js";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeftIcon, ChevronRightIcon, PlusIcon } from "lucide-react";
import { type ReactElement, useMemo, useState } from "react";
import { useApp } from "@/app-context";
import { AddTopics, topicTargets } from "@/calendar/add-topics";
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
import { RecentlyFinished, recentlyFinished } from "@/calendar/recent";
import { SuggestedTopics, suggesting } from "@/calendar/suggestions";
import { useCalendarMoves } from "@/calendar/use-moves";
import { ChannelPicker, useCurrentChannel } from "@/channels/current";
import { QueueList } from "@/components/batch-queue";
import { StatusSlot } from "@/components/kit/action-bar";
import { Button } from "@/components/kit/button";
import { useCommand } from "@/components/kit/command-palette";
import { EmptyState } from "@/components/kit/empty-state";
import { PageHeader } from "@/components/kit/layout";
import { ButtonLink, TextLink } from "@/components/kit/link";
import { LoadFailed, LoadingBlock, StaleNote } from "@/components/kit/query-state";
import { SectionHead } from "@/components/kit/section-head";
import { Segmented } from "@/components/kit/switch";
import { TabPanel, Tabs } from "@/components/kit/tabs";
import { fullDay, plural } from "@/lib/format";
import { intents, useIntent } from "@/lib/intents";
import { projectsQuery } from "@/queries";
import { calendarQuery, schedulesQuery } from "@/schedules/api";
import { requestNewSchedule } from "@/schedules/new-from";
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

// One line under the tabs saying what the open one is for: making (the weeks, the schedules)
// or publishing (the releases).
export const calendarTabLines: Readonly<Record<CalendarTab, string>> = {
  weeks: "The videos your schedules will make, day by day.",
  releases:
    "When each finished video goes public on YouTube. You upload it; the calendar keeps the day and time.",
  schedules:
    "A schedule makes a new video from one of your templates at a time you pick, once or every week.",
};

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
// on another schedule's run to move it there. Suggested topics wait above it, and the newest
// finished videos above them. With nothing scheduled, the weeks give way to what a schedule is
// and the two ways on: make a video now, or a new schedule. The Schedules tab holds every
// schedule, its detail and New schedule (`schedules/view.tsx`); `/schedules` redirects there.
// Without `onTab` (a test rendering the screen alone) the tab lives here.
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
  const recent = recentlyFinished(projects.data?.projects ?? [], (id) => current.includes(id));
  const liveSchedules = mySchedules.filter((one) => one.deletedAt === null);
  const targets = topicTargets(mySchedules);
  // Nothing will be made: no schedule in view and no run in these weeks. The weeks would be
  // empty boxes, so the screen says what a schedule is and offers the two ways on instead.
  const nothingScheduled =
    calendar.data !== undefined &&
    schedules.data !== undefined &&
    liveSchedules.length === 0 &&
    allRuns.length === 0;
  // The weeks stay while something ran or finished in them, scheduled or not.
  const showWeeks = !nothingScheduled || (visible?.projects.length ?? 0) > 0;
  // The drag sentence only matters once there is a topic to pick up.
  const movable = allRuns.some((run) => run.index !== null);

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
  // New schedule from the weeks: the Schedules tab, with its form open.
  const newSchedule = () => {
    requestNewSchedule();
    chooseTab("schedules");
  };

  useCommand({
    id: "calendar.add",
    title: "Add topics to a schedule",
    group: "Calendar",
    keywords: ["topics", "batch", "queue", "calendar"],
    run: () => setAdding(true),
  });
  useCommand({
    id: "calendar.schedules",
    title: "Show the schedules",
    group: "Calendar",
    keywords: ["edit", "recurring", "pause", "resume"],
    run: () => chooseTab("schedules"),
  });
  // "Add topics to a schedule" run from another screen lands here
  // (`components/global-commands.tsx`).
  useIntent(intents.addToCalendar, () => setAdding(true));
  useCommand({
    id: "calendar.weeks",
    title: "Show the calendar as a grid",
    group: "Calendar",
    keywords: ["weeks"],
    run: () => chooseView("weeks"),
  });
  useCommand({
    id: "calendar.list",
    title: "Show the calendar as a list",
    group: "Calendar",
    run: () => chooseView("list"),
  });

  const queued = liveSchedules.reduce((sum, one) => sum + one.items.length, 0);
  // The status slot is for what the person just did; a failed load says so in place, with Retry.
  const today = dayKey(new Date());
  const windowLabel = `${shortDay.format(new Date(range.from))} to ${shortDay.format(new Date(Date.parse(range.to) - 2 * dayMs))}`;
  // The queue of the channel shown, in its order.
  const waiting = (visible?.queued ?? [])
    .filter((item) => current.includes(projectChannel.get(item.projectId)))
    .toSorted((a, b) => a.position - b.position);
  const stillWaiting = waiting.filter((item) => item.state === "queued");
  const holdingQueue = waiting.find(
    (item) =>
      item.state === "active" &&
      visible?.projects.find((one) => one.id === item.projectId)?.state === "paused",
  );
  const scheduleCount = (schedules.data ?? []).filter((one) => one.deletedAt === null).length;
  const planned = `${String(allRuns.length)} ${allRuns.length === 1 ? "video" : "videos"} planned ${shift === 0 ? `in the next ${String(weeks)} weeks` : windowLabel}`;

  return (
    <div data-tour="calendar">
      <PageHeader
        title="Calendar"
        meta={`${planned}${queued === 0 ? "" : ` · ${String(queued)} ${queued === 1 ? "topic" : "topics"} queued`}`}
        actions={
          <>
            <ChannelPicker />
            {/* With nothing scheduled, the empty state below offers New schedule itself. */}
            {tab === "weeks" && !nothingScheduled && (templates.data?.length ?? 0) > 0 ? (
              <Button onClick={newSchedule}>
                <PlusIcon aria-hidden="true" strokeWidth={1.75} />
                New schedule
              </Button>
            ) : null}
            {tab === "weeks" && targets.length > 0 ? (
              <Button variant="primary" onClick={() => setAdding(true)}>
                <PlusIcon aria-hidden="true" strokeWidth={1.75} />
                Add topics to a schedule
              </Button>
            ) : null}
          </>
        }
      />
      <Tabs
        items={[
          { id: "weeks", label: "Coming weeks" },
          { id: "releases", label: "Releases" },
          {
            id: "schedules",
            label: "Schedules",
            ...(scheduleCount === 0 ? {} : { badge: String(scheduleCount) }),
          },
        ]}
        value={tab}
        onChange={chooseTab}
        label="Calendar sections"
        idPrefix="calendar"
        className="mb-2"
      />
      <p className="m-0 mb-4 max-w-[90ch] text-small text-ink-2">
        {calendarTabLines[tab]}
        {/* Once schedules exist, the two words the weeks are made of; with none, the empty
            state says what a schedule is. */}
        {tab === "weeks" && liveSchedules.length > 0
          ? " A schedule makes a video on each of its days; a topic is what one of those videos is about."
          : null}
      </p>
      <TabPanel idPrefix="calendar" id="releases" active={tab === "releases"}>
        {tab === "releases" ? <ReleasesView /> : null}
      </TabPanel>
      <TabPanel idPrefix="calendar" id="schedules" active={tab === "schedules"}>
        {tab === "schedules" ? <SchedulesView pickedId={schedule} onPick={onSchedule} /> : null}
      </TabPanel>
      <TabPanel
        idPrefix="calendar"
        id="weeks"
        active={tab === "weeks"}
        className="flex flex-col gap-4"
      >
        <StatusSlot tone={message === null ? "info" : "error"}>{message ?? undefined}</StatusSlot>
        {calendar.data === undefined ? null : calendar.error === null ? null : (
          <StaleNote
            what="the calendar"
            error={calendar.error}
            updatedAt={calendar.dataUpdatedAt}
            onRetry={() => void calendar.refetch()}
            retrying={calendar.isFetching}
          />
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
              <p className="m-0 text-small text-ink-2">
                {attentionMeta(attention)}. <TextLink to="/">Open Home</TextLink> to act on them.
              </p>
            )}
            {nothingScheduled ? (
              <EmptyState
                title="Nothing scheduled yet"
                actions={
                  <>
                    <ButtonLink to="/play" variant="primary">
                      Make a video now
                    </ButtonLink>
                    <Button onClick={newSchedule}>
                      <PlusIcon aria-hidden="true" strokeWidth={1.75} />
                      New schedule
                    </Button>
                  </>
                }
              >
                A schedule makes a new video from one of your templates at a time you pick, once or
                every week.
              </EmptyState>
            ) : null}
            <RecentlyFinished projects={recent} />
            {schedules.data !== undefined && suggesting(mySchedules).length === 0 ? null : (
              <section aria-label="Suggested topics" className="min-w-0">
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
            {showWeeks ? (
              // The weeks take the page's full width: seven days side by side need it.
              <section aria-label="Coming weeks" className="flex min-w-0 flex-col gap-3">
                <WindowSteps
                  label={windowLabel}
                  shift={shift}
                  onShift={(by) => setShift((now) => (by === 0 ? 0 : now + by))}
                  view={view}
                  onView={chooseView}
                />
                {calendar.data === undefined ? (
                  <LoadingBlock label="Loading the calendar…" rows={2} rowClassName="h-40" />
                ) : view === "weeks" ? (
                  <>
                    {movable ? (
                      <p className="m-0 text-small text-ink-2">
                        Drag a topic to another day to change when it is made, or onto another
                        schedule's day to move it there. With the keyboard: focus a topic and press
                        Alt+← or Alt+→.
                      </p>
                    ) : null}
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
              </section>
            ) : null}
            {stillWaiting.length > 0 ? (
              // Home's list, in Home's words: the videos still to start, numbered in their order,
              // with Earlier, Later and Remove. The one running is on Home under Running.
              <section aria-label="Waiting to start" className="flex flex-col gap-1">
                <SectionHead
                  title="Waiting to start"
                  meta={`${plural(stillWaiting.length, "video", "videos")}, in the order they start`}
                />
                {/* Pausing the started one holds the whole queue, so it says so. */}
                {holdingQueue === undefined ? null : (
                  <p className="m-0 text-small text-ink-2">
                    {`${holdingQueue.title} is paused, so none of these starts until it continues.`}
                  </p>
                )}
                <QueueList waiting={stillWaiting} projects={projects.data?.projects} />
              </section>
            ) : null}
          </>
        )}
      </TabPanel>
      <AddTopics open={adding} onOpenChange={setAdding} schedules={mySchedules} />
    </div>
  );
}

// Earlier and Later move the weeks shown four at a time; This week comes back once they have
// moved. Grid or List, at the line's end, picks how the same weeks are drawn.
function WindowSteps({
  label,
  shift,
  onShift,
  view,
  onView,
}: {
  readonly label: string;
  readonly shift: number;
  readonly onShift: (by: -1 | 0 | 1) => void;
  readonly view: View;
  readonly onView: (view: View) => void;
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
      {shift === 0 ? null : (
        <Button size="small" variant="quiet" onClick={() => onShift(0)}>
          Back to this week
        </Button>
      )}
      <Segmented
        label="Show the weeks as"
        value={view}
        onChange={onView}
        className="ml-auto"
        options={[
          { value: "weeks", label: "Grid" },
          { value: "list", label: "List" },
        ]}
      />
    </div>
  );
}
