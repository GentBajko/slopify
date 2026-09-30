import type { Calendar, CalendarRun } from "@app/slices/schedules/schema.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowDownIcon, ArrowUpIcon, PlusIcon } from "lucide-react";
import { type DragEvent, type KeyboardEvent, type ReactElement, useMemo, useState } from "react";
import { useApp } from "@/app-context";
import { AddToCalendar } from "@/calendar/add-topics";
import {
  attentionMeta,
  type CalendarProject,
  needingAttention,
  projectLook,
} from "@/calendar/attention";
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
import { SuggestedTopics } from "@/calendar/suggestions";
import { useCurrentChannel } from "@/channels/current";
import { StatusSlot } from "@/components/kit/action-bar";
import { Board, BoardColumn } from "@/components/kit/board";
import { Button, IconButton } from "@/components/kit/button";
import { useCommand } from "@/components/kit/command-palette";
import { helpScope, InfoTip } from "@/components/kit/info-tip";
import { PageHeader } from "@/components/kit/layout";
import { ButtonLink } from "@/components/kit/link";
import { hitArea, hitTarget, List, ListRow } from "@/components/kit/list-row";
import { SectionHead } from "@/components/kit/section-head";
import { Status } from "@/components/kit/status";
import { Segmented } from "@/components/kit/switch";
import { TabPanel, Tabs } from "@/components/kit/tabs";
import { intents, useIntent } from "@/lib/intents";
import { cn } from "@/lib/utils";
import { projectsQuery } from "@/queries";
import {
  calendarKey,
  calendarQuery,
  moveTopic,
  prepareTopic,
  type ScheduleReply,
  schedulesKey,
  schedulesQuery,
  transferTopic,
} from "@/schedules/api";
import { SchedulesView } from "@/schedules/view";
import { PrepareUpload } from "@/studio/prepare-upload";
import { templatesQuery } from "@/templates/api";

const weeks = 4;
type View = "weeks" | "list";

// The calendar's two tabs: the coming weeks, and the schedules that fill them. Only the
// Schedules tab shows in the URL (`?tab=schedules`), so `/calendar` stays the weeks.
export const calendarTabs = ["weeks", "schedules"] as const;
export type CalendarTab = (typeof calendarTabs)[number];

export function calendarTabOf(value: unknown): CalendarTab {
  return value === "schedules" ? "schedules" : "weeks";
}

const dayLabel = new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric" });
const fullDay = new Intl.DateTimeFormat(undefined, { dateStyle: "full" });
const time = new Intl.DateTimeFormat(undefined, { timeStyle: "short" });

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
  const client = useQueryClient();
  const current = useCurrentChannel();
  // The window starts on this week's Monday, fixed for the life of the page.
  const [range] = useState(() => rangeOf(new Date(), weeks));
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
  const [message, setMessage] = useState<{ tone: "error" | "info"; text: string } | null>(null);
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

  const action = useMutation({
    mutationFn: (job: () => Promise<ScheduleReply<unknown>>) => job(),
    onSuccess: (reply) =>
      setMessage(
        reply.ok ? { tone: "info", text: "Moved." } : { tone: "error", text: reply.message },
      ),
    onError: (cause: Error) =>
      setMessage({
        tone: "error",
        text: `The topic wasn't moved: ${cause.message} Reload the calendar and try again.`,
      }),
    onSettled: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: calendarKey }),
        client.invalidateQueries({ queryKey: schedulesKey }),
      ]);
    },
  });

  const apply = (drop: Drop) => {
    if (drop.kind === "none") return;
    if (drop.kind === "refused") {
      setMessage({ tone: "error", text: drop.message });
      return;
    }
    if (drop.kind === "move")
      action.mutate(() =>
        moveTopic(api, drop.scheduleId, {
          baseVersion: drop.baseVersion,
          from: drop.from,
          to: drop.to,
        }),
      );
    else
      action.mutate(() =>
        transferTopic(api, drop.scheduleId, {
          baseVersion: drop.baseVersion,
          index: drop.index,
          targetId: drop.targetId,
          ...(drop.position === undefined ? {} : { position: drop.position }),
        }),
      );
  };
  const step = (run: CalendarRun, by: -1 | 1) => {
    const target = neighbour(allRuns, run, by);
    if (target === undefined) {
      setMessage({
        tone: "error",
        text:
          by === -1
            ? `${runTitle(run)} is already the next topic of ${run.scheduleName}.`
            : `${runTitle(run)} is the last topic on the calendar for ${run.scheduleName}.`,
      });
      return;
    }
    apply(planDrop(run, target, fullDay.format(new Date(target.at))));
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
  const status = message?.text ?? calendar.error?.message ?? schedules.error?.message;
  const today = dayKey(new Date());
  const liveSchedules = (schedules.data ?? []).filter((one) => one.deletedAt === null).length;

  return (
    <div data-tour="calendar">
      <PageHeader
        title="Calendar"
        meta={`${current.channel?.name ?? "Every channel"} · ${String(allRuns.length)} scheduled ${allRuns.length === 1 ? "run" : "runs"} in the next ${String(weeks)} weeks · ${String(queued)} ${queued === 1 ? "topic" : "topics"} queued`}
        actions={
          tab === "schedules" ? undefined : (
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
      <TabPanel idPrefix="calendar" id="schedules" active={tab === "schedules"}>
        {tab === "schedules" ? <SchedulesView pickedId={schedule} onPick={onSchedule} /> : null}
      </TabPanel>
      <TabPanel idPrefix="calendar" id="weeks" active={tab === "weeks"}>
        <StatusSlot
          tone={message?.tone === "info" ? "info" : status ? "error" : "info"}
          className="mb-3"
        >
          {status}
        </StatusSlot>
        <Board split="aside" className="mb-6">
          <BoardColumn label="Needs you">
            {attention.length === 0 ? (
              <p className="m-0 text-small text-ink-3">Nothing needs you right now.</p>
            ) : (
              <section aria-label="Needs you">
                <SectionHead title="Needs you" meta={attentionMeta(attention)} />
                <List label="Needs you">
                  {attention.map((project) => (
                    <ProjectRow key={project.id} project={project} />
                  ))}
                </List>
              </section>
            )}
          </BoardColumn>
          <BoardColumn as="aside" label="Suggested topics">
            <SuggestedTopics schedules={mySchedules} />
          </BoardColumn>
        </Board>
        {/* The weeks take the page's full width: seven days side by side need it. */}
        <section aria-label="Coming weeks" className="flex min-w-0 flex-col gap-4">
          {calendar.isPending ? (
            <p className="m-0 text-small text-ink-3">Loading the calendar…</p>
          ) : view === "weeks" ? (
            <>
              <p className="m-0 text-small text-ink-2">
                Drag a topic to another day to change when it runs, or onto another schedule's run
                to move it there. With the keyboard: focus a topic and press Alt+← or Alt+→.
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
                          apply(planDrop(dragging, target, fullDay.format(date)));
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
              onTransfer={(run, targetId) => {
                // To the end of the other schedule's queue.
                if (run.index !== null)
                  apply({
                    kind: "transfer",
                    scheduleId: run.scheduleId,
                    baseVersion: run.scheduleVersion,
                    index: run.index,
                    targetId,
                    position: undefined,
                  });
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
                {visible.queued
                  .toSorted((a, b) => a.position - b.position)
                  .map((item, index) => {
                    // Pausing a queued project holds the whole queue, so it says so.
                    const paused =
                      visible.projects.find((one) => one.id === item.projectId)?.state === "paused";
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
                          <Status
                            tone={paused ? "waiting" : item.state === "active" ? "running" : "off"}
                          >
                            {paused
                              ? "Paused"
                              : item.state === "active"
                                ? "Running now"
                                : "Waiting its turn"}
                          </Status>
                        }
                      />
                    );
                  })}
              </List>
            </section>
          ) : null}
        </section>
      </TabPanel>
      <AddToCalendar open={adding} onOpenChange={setAdding} schedules={mySchedules} />
    </div>
  );
}

function DayCell({
  date,
  today,
  day,
  dragging,
  busy,
  onDragStart,
  onDragEnd,
  onDrop,
  onStep,
}: {
  readonly date: Date;
  readonly today: boolean;
  readonly day: Day | undefined;
  readonly dragging: CalendarRun | null;
  readonly busy: boolean;
  readonly onDragStart: (run: CalendarRun) => void;
  readonly onDragEnd: () => void;
  readonly onDrop: (target: CalendarRun | undefined) => void;
  readonly onStep: (run: CalendarRun, by: -1 | 1) => void;
}): ReactElement {
  const [over, setOver] = useState(false);
  // A busy day shows its first few projects and a count; the rest open in place.
  const [all, setAll] = useState(false);
  const runs = day?.runs ?? [];
  const projects = day?.projects ?? [];
  const shownProjects = all ? projects : projects.slice(0, dayProjectsShown);
  // A drop on the day itself lands on its first run of the dragged topic's schedule, else its
  // first run.
  const dayTarget = (): CalendarRun | undefined =>
    runs.find((run) => run.scheduleId === dragging?.scheduleId) ?? runs[0];
  const allow = (event: DragEvent) => {
    if (dragging === null) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setOver(true);
  };
  return (
    <section
      aria-label={fullDay.format(date)}
      className={cn("sl-cal-day", today && "sl-cal-day--today", over && "sl-cal-day--over")}
      onDragOver={allow}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setOver(false);
        onDrop(dayTarget());
      }}
    >
      <div className="sl-kicker">
        {today ? `Today · ${dayLabel.format(date)}` : dayLabel.format(date)}
      </div>
      {runs.map((run) => (
        <RunChip
          key={`${run.scheduleId}-${run.at}`}
          run={run}
          busy={busy}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onDrop={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setOver(false);
            onDrop(run);
          }}
          onStep={onStep}
        />
      ))}
      {shownProjects.map((project) => {
        const look = projectLook(project);
        return (
          <div key={project.id} className={`sl-cal-item sl-cal-item--project ${hitArea}`}>
            <Link
              to="/projects/$projectId"
              params={{ projectId: project.id }}
              className={`text-small font-semibold ${hitTarget}`}
            >
              {project.title}
            </Link>
            <Status tone={look.tone}>{look.word}</Status>
          </div>
        );
      })}
      {projects.length > dayProjectsShown ? (
        <Button
          variant="quiet"
          size="small"
          aria-expanded={all}
          className="self-start"
          onClick={() => setAll((open) => !open)}
        >
          {all ? "Show fewer" : `+${String(projects.length - dayProjectsShown)} more`}
        </Button>
      ) : null}
    </section>
  );
}

// How many of a day's projects show before "+N more".
const dayProjectsShown = 3;

function RunChip({
  run,
  busy,
  onDragStart,
  onDragEnd,
  onDrop,
  onStep,
}: {
  readonly run: CalendarRun;
  readonly busy: boolean;
  readonly onDragStart: (run: CalendarRun) => void;
  readonly onDragEnd: () => void;
  readonly onDrop: (event: DragEvent) => void;
  readonly onStep: (run: CalendarRun, by: -1 | 1) => void;
}): ReactElement {
  const movable = run.index !== null && !busy;
  const title = runTitle(run);
  const onKeyDown = (event: KeyboardEvent) => {
    if (!movable || !event.altKey) return;
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      onStep(run, -1);
    } else if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      onStep(run, 1);
    }
  };
  return (
    // Focus is how the keyboard picks a topic to move (Alt+arrows); the list view's buttons are
    // the other way to do it without dragging.
    <article
      tabIndex={run.index === null ? undefined : 0}
      aria-label={`${title}, ${time.format(new Date(run.at))}, ${run.scheduleName}${run.index === null ? "" : ". Alt+arrow keys move it."}`}
      draggable={movable}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", title);
        onDragStart(run);
      }}
      onDragEnd={onDragEnd}
      onDragOver={(event) => event.preventDefault()}
      onDrop={onDrop}
      onKeyDown={onKeyDown}
      className={cn("sl-cal-item", movable && "sl-cal-item--movable")}
    >
      <span className="text-label text-ink-3 tabular-nums">{time.format(new Date(run.at))}</span>
      <b className={cn("text-small", run.topic === null && "font-normal text-ink-2")}>{title}</b>
      <span className="text-label text-ink-3">{run.scheduleName}</span>
      {run.paused ? (
        <Status tone="waiting">Paused</Status>
      ) : run.topicSource === "held" ? (
        <Status tone="info">Needs a topic</Status>
      ) : run.prepared !== null ? (
        <Status tone="info">Prepared</Status>
      ) : (
        <Status tone="off">Queued</Status>
      )}
      <PrepareRun run={run} compact />
    </article>
  );
}

// Prepare a queued topic ahead: its project runs everything but the video now, and its day
// renders. Once prepared, the way to its project.
function PrepareRun({
  run,
  compact = false,
}: {
  readonly run: CalendarRun;
  readonly compact?: boolean;
}): ReactElement | null {
  const { api } = useApp();
  const client = useQueryClient();
  const [problem, setProblem] = useState<string | undefined>();
  const prepare = useMutation({
    mutationFn: async () => {
      if (run.topic === null) throw new Error("This run has no topic to prepare yet.");
      const reply = await prepareTopic(api, run.scheduleId, run.topic);
      if (!reply.ok) throw new Error(reply.message);
      return reply.value;
    },
    onSuccess: () => {
      setProblem(undefined);
      void client.invalidateQueries({ queryKey: calendarKey });
      void client.invalidateQueries({ queryKey: ["projects"] });
    },
    onError: (error) => setProblem(error.message),
  });
  if (run.prepared !== null)
    return (
      <ButtonLink
        to="/projects/$projectId"
        params={{ projectId: run.prepared }}
        size="small"
        variant="quiet"
      >
        {compact ? "Open" : "Open prepared"}
      </ButtonLink>
    );
  if (run.index === null || run.topic === null || run.topicSource !== "queued") return null;
  return (
    <>
      <Button
        size="small"
        variant={compact ? "quiet" : "secondary"}
        disabled={prepare.isPending}
        onClick={(event) => {
          event.stopPropagation();
          prepare.mutate();
        }}
      >
        {prepare.isPending ? "Preparing…" : "Prepare"}
      </Button>
      {problem === undefined ? null : (
        <span role="alert" className="text-label text-danger">
          {problem}
        </span>
      )}
    </>
  );
}

// A project as a list row: its state in words and, when it asks something of the person or
// its video is ready, the button that acts on it.
function ProjectRow({ project }: { readonly project: CalendarProject }): ReactElement {
  const look = projectLook(project);
  return (
    <ListRow
      title={
        <Link to="/projects/$projectId" params={{ projectId: project.id }}>
          {project.title}
        </Link>
      }
      actions={
        <>
          <Status tone={look.tone}>{look.word}</Status>
          {look.action === undefined ? null : look.action.kind === "upload" ? (
            <PrepareUpload projectId={project.id} ready />
          ) : (
            <ButtonLink
              to="/projects/$projectId"
              params={{ projectId: project.id }}
              size="small"
              variant="secondary"
            >
              {look.action.label}
            </ButtonLink>
          )}
        </>
      }
    />
  );
}

function ListView({
  days,
  busy,
  schedules,
  onStep,
  onTransfer,
}: {
  readonly days: ReadonlyMap<string, Day>;
  readonly busy: boolean;
  readonly schedules: readonly {
    readonly id: string;
    readonly name: string;
    readonly status: string;
    readonly deletedAt: string | null;
  }[];
  readonly onStep: (run: CalendarRun, by: -1 | 1) => void;
  readonly onTransfer: (run: CalendarRun, targetId: string) => void;
}): ReactElement {
  const ordered = [...days.values()].sort((a, b) => a.key.localeCompare(b.key));
  if (ordered.length === 0)
    return (
      <p className="m-0 text-ink-2">
        Nothing is planned for the next {weeks} weeks. Add topics with Add to calendar, or create a
        schedule on the{" "}
        <Link to="/calendar" search={{ tab: "schedules" }}>
          Schedules
        </Link>{" "}
        tab.
      </p>
    );
  const targets = schedules.filter(
    (one) => one.deletedAt === null && (one.status === "active" || one.status === "paused"),
  );
  return (
    <div className="flex flex-col gap-6" {...helpScope}>
      <p className="m-0 flex items-center gap-1 text-small text-ink-2">
        Move a topic earlier, later or to another schedule from its row.
        <InfoTip id="planning.calendar.move" className="-my-1" />
      </p>
      {ordered.map((day) => (
        <section key={day.key} aria-label={fullDay.format(day.date)}>
          <SectionHead title={fullDay.format(day.date)} as="h3" />
          <List label={`Planned on ${fullDay.format(day.date)}`}>
            {day.runs.map((run) => {
              const title = runTitle(run);
              const others = targets.filter((one) => one.id !== run.scheduleId);
              return (
                <ListRow
                  key={`${run.scheduleId}-${run.at}`}
                  title={title}
                  meta={`${time.format(new Date(run.at))} · ${run.scheduleName}${run.templateName === null ? "" : ` · ${run.templateName}`}${run.paused ? " · Paused" : ""}`}
                  actions={
                    run.index === null ? undefined : (
                      <>
                        <PrepareRun run={run} />
                        <IconButton
                          size="small"
                          label={`Move ${title} earlier`}
                          disabled={busy}
                          onClick={() => onStep(run, -1)}
                        >
                          <ArrowUpIcon aria-hidden="true" strokeWidth={1.75} />
                        </IconButton>
                        <IconButton
                          size="small"
                          label={`Move ${title} later`}
                          disabled={busy}
                          onClick={() => onStep(run, 1)}
                        >
                          <ArrowDownIcon aria-hidden="true" strokeWidth={1.75} />
                        </IconButton>
                        {others.length === 0 ? null : (
                          <select
                            aria-label={`Move ${title} to another schedule`}
                            className="sl-select h-8 w-auto text-small"
                            value=""
                            disabled={busy}
                            onChange={(event) => {
                              if (event.target.value !== "") onTransfer(run, event.target.value);
                            }}
                          >
                            <option value="">Move to…</option>
                            {others.map((one) => (
                              <option key={one.id} value={one.id}>
                                {one.name}
                              </option>
                            ))}
                          </select>
                        )}
                      </>
                    )
                  }
                />
              );
            })}
            {day.projects.map((project) => (
              <ProjectRow key={project.id} project={project} />
            ))}
          </List>
        </section>
      ))}
    </div>
  );
}
