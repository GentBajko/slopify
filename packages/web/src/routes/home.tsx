import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { CalendarIcon, PlusIcon } from "lucide-react";
import { type ReactElement, useEffect, useMemo, useState } from "react";
import { useApp } from "@/app-context";
import { ChannelPicker, useCurrentChannel } from "@/channels/current";
import { Board, BoardColumn } from "@/components/kit/board";
import { EmptyState } from "@/components/kit/empty-state";
import { helpScope, InfoTip } from "@/components/kit/info-tip";
import { PageHeader } from "@/components/kit/layout";
import { ButtonLink } from "@/components/kit/link";
import { LoadFailed, LoadingBlock, QueryState, StaleNote } from "@/components/kit/query-state";
import { SectionHead } from "@/components/kit/section-head";
import { ComingUp } from "@/home/coming-up";
import { isWaiting } from "@/home/needs-you";
import { isReadyToUpload } from "@/home/ready";
import { isQueued, RunningMore } from "@/home/running-more";
import { RunningProject } from "@/home/running-now";
import { WeekTotals } from "@/home/week";
import { type Decision, WorkList } from "@/home/work-list";
import { dismissFirstRun, onboardingKey, readFirstRun } from "@/onboarding/api";
import { projectsQuery } from "@/queries";
import { calendarQuery, schedulesQuery } from "@/schedules/api";
import { templatesQuery } from "@/templates/api";

const dayMs = 24 * 60 * 60_000;
const today = new Intl.DateTimeFormat(undefined, {
  weekday: "long",
  day: "numeric",
  month: "long",
});

// Set once the first-run screen was opened in this tab, so coming back to Home stays here.
let welcomed = false;
// The settle is sent once per visit.
let settled = false;

// Home, for the channel picked in the rail (or all): one work list of what needs the person
// (decisions, then videos ready to upload), what is running, what the schedules start in the
// next seven days once there are schedules, and this week's totals on request. Each region
// says when it is loading or failed, with Retry in place; nothing reads as empty before it
// loaded.
export function HomeRoute(): ReactElement {
  const { api } = useApp();
  const current = useCurrentChannel();
  const projects = useQuery(projectsQuery(api));
  const schedules = useQuery(schedulesQuery(api));
  const templates = useQuery(templatesQuery(api));
  // The next seven days from local midnight, fixed for the life of the page.
  const [range] = useState(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return {
      from: new Date().toISOString(),
      to: new Date(start.valueOf() + 8 * dayMs).toISOString(),
    };
  });
  const calendar = useQuery(calendarQuery(api, range.from, range.to));
  // A clock for the running steps' times; once a second is what the eye reads.
  const firstRun = useQuery({ queryKey: onboardingKey, queryFn: () => readFirstRun(api) });
  const navigate = useNavigate();
  // A fresh install opens on the first-run screen, once per visit.
  useEffect(() => {
    if (firstRun.data?.show === true && !welcomed) {
      welcomed = true;
      void navigate({ to: "/welcome" });
    }
  }, [firstRun.data?.show, navigate]);
  // A real project made before the first-run screen was done with: record it, so deleting every
  // project later does not bring the screen back. Reading the screen's state writes nothing.
  useEffect(() => {
    if (firstRun.data?.settle === true && !settled) {
      settled = true;
      void dismissFirstRun(api).catch(() => {
        settled = false;
      });
    }
  }, [firstRun.data?.settle, api]);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const templateChannel = useMemo(
    () => new Map((templates.data ?? []).map((one) => [one.id, one.channelId])),
    [templates.data],
  );
  const mine = (projects.data?.projects ?? []).filter((one) => current.includes(one.channelId));
  // Paused runs wait for the person, so they sit under Needs you, not Running now.
  const running = mine.filter((one) => one.status === "running");
  // Started and waiting their turn: they show as one line under Running now.
  const queued = mine.filter(isQueued);
  // The bundled samples are finished videos too, but nobody uploads them.
  const samples = new Set(
    Object.values(firstRun.data?.samples ?? {}).filter((id): id is string => id !== null),
  );
  const ready = mine.filter((one) => isReadyToUpload(one) && !samples.has(one.id));
  const failed = mine.filter((one) => one.status === "failed");
  const mySchedules = (schedules.data ?? []).filter(
    (one) => one.deletedAt === null && current.includes(templateChannel.get(one.templateId)),
  );
  const held = mySchedules.filter(
    (one) => one.topicGeneration.mode === "hold" && one.topics.held > 0,
  );
  const upcoming = (calendar.data?.runs ?? []).filter((run) =>
    current.includes(templateChannel.get(run.templateId)),
  );
  const decisions: Decision[] = [
    ...mine.filter(isWaiting).map((project) => ({ kind: "waiting" as const, project })),
    ...mine
      .filter((one) => one.status === "paused")
      .map((project) => ({ kind: "paused" as const, project })),
    ...held.map((schedule) => ({ kind: "held" as const, schedule })),
  ];
  const hasWork = decisions.length + failed.length + ready.length > 0;
  const active = running.length + queued.length > 0;
  // Upcoming runs only matter once there is a schedule; until the schedules answer, the
  // section holds its place.
  const showComingUp = schedules.data === undefined || mySchedules.length > 0;
  const retryProjects = (): void => {
    void projects.refetch();
  };

  return (
    <div data-tour="home">
      <PageHeader
        display
        crumb={today.format(new Date())}
        title={current.channel?.name ?? "Home"}
        meta={current.channelId === null ? "Every channel" : undefined}
        actions={
          <>
            <ButtonLink to="/play" variant="secondary">
              <PlusIcon aria-hidden="true" strokeWidth={1.75} />
              Create
            </ButtonLink>
            <ButtonLink to="/calendar" variant="quiet">
              <CalendarIcon aria-hidden="true" strokeWidth={1.75} />
              Open calendar
            </ButtonLink>
          </>
        }
      />
      <div className="mb-5 flex items-end gap-1 md:hidden" {...helpScope}>
        <ChannelPicker className="min-w-0 flex-1" />
        <InfoTip id="home.channel" className="mb-1" />
      </div>
      <Board split="main-side">
        <BoardColumn>
          {projects.data === undefined ? (
            projects.error !== null ? (
              <LoadFailed
                what="Your projects"
                error={projects.error}
                onRetry={retryProjects}
                retrying={projects.isFetching}
              />
            ) : (
              // A placeholder, not yet the Needs you region: its rows are not known.
              <div>
                <SectionHead title="Needs you" info="home.needs-you" meta="Loading…" />
                <LoadingBlock label="Loading your projects…" rows={2} rowClassName="h-28" />
              </div>
            )
          ) : (
            <>
              {projects.error === null ? null : (
                <StaleNote
                  what="your projects"
                  error={projects.error}
                  updatedAt={projects.dataUpdatedAt}
                  onRetry={retryProjects}
                  retrying={projects.isFetching}
                />
              )}
              {hasWork ? <WorkList decisions={decisions} failed={failed} ready={ready} /> : null}
              {active ? (
                <section id="running" aria-label="Running now">
                  <SectionHead
                    title="Running now"
                    info="home.running"
                    meta={
                      running.length === 0
                        ? "Nothing is running yet"
                        : `${String(running.length)} ${running.length === 1 ? "video" : "videos"}`
                    }
                  />
                  {running.length === 0 ? null : (
                    <ul className="m-0 flex list-none flex-col gap-3 p-0">
                      {running.slice(0, 3).map((project) => (
                        <RunningProject key={project.id} project={project} now={now} />
                      ))}
                    </ul>
                  )}
                  <RunningMore running={running.length} queued={queued} />
                </section>
              ) : null}
              {hasWork || active ? null : (
                <EmptyState title="Nothing needs you and nothing is running">
                  Start a video with New project, or let a schedule start one.
                </EmptyState>
              )}
            </>
          )}
        </BoardColumn>
        <BoardColumn>
          {showComingUp ? (
            <section aria-label="Coming up">
              <SectionHead title="Coming up" info="home.coming-up" meta="Next 7 days" />
              {schedules.error !== null && schedules.data === undefined ? (
                <LoadFailed
                  compact
                  what="Your schedules"
                  error={schedules.error}
                  onRetry={() => void schedules.refetch()}
                  retrying={schedules.isFetching}
                />
              ) : (
                <QueryState
                  query={calendar}
                  what="The calendar"
                  compact
                  loading={
                    <LoadingBlock label="Loading the calendar…" rows={2} rowClassName="h-12" />
                  }
                >
                  {() =>
                    upcoming.length === 0 ? (
                      <p className="m-0 text-small text-ink-2">
                        No scheduled runs in the next 7 days.
                      </p>
                    ) : (
                      <ComingUp runs={upcoming.slice(0, 6)} />
                    )
                  }
                </QueryState>
              )}
            </section>
          ) : null}
          <WeekTotals channelId={current.channelId} />
        </BoardColumn>
      </Board>
    </div>
  );
}
