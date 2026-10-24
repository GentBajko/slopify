import type { ProjectListing } from "@app/slices/admission/model.js";
import {
  failedRun,
  queuedRun,
  runningNow,
  waitsForPerson,
} from "@app/slices/admission/state-words.js";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { type ReactElement, useEffect, useMemo, useState } from "react";
import { useApp } from "@/app-context";
import { ChannelPicker, useCurrentChannel } from "@/channels/current";
import { Board, BoardColumn } from "@/components/kit/board";
import { EmptyState } from "@/components/kit/empty-state";
import { PageHeader } from "@/components/kit/layout";
import { ButtonLink, TextLink } from "@/components/kit/link";
import { LoadFailed, LoadingBlock, QueryState, StaleNote } from "@/components/kit/query-state";
import { SectionHead } from "@/components/kit/section-head";
import { NewModelsSlot } from "@/components/model-checks";
import { Autopilot } from "@/home/autopilot";
import { ComingUp } from "@/home/coming-up";
import { finishedWork } from "@/home/ready";
import { RunningMore } from "@/home/running-more";
import { RunningProject } from "@/home/running-now";
import { FirstVideo } from "@/home/setup";
import { StartFromTemplate, type TemplateStart } from "@/home/templates";
import { ThisWeek } from "@/home/week";
import { type Decision, FinishedList, WorkList } from "@/home/work-list";
import { plural } from "@/lib/format";
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

// Newest finished first: what finished overnight is what the morning look is for.
const byFinished = (a: ProjectListing, b: ProjectListing): number =>
  (b.finishedAt ?? b.updatedAt).localeCompare(a.finishedAt ?? a.updatedAt);

// Home, for the channel shown (or all). Before the person has a project of their own: what a
// video needs on this computer with each fix, Make your first video, and the finished samples
// to watch. Then: Finished (the newest finished videos, uploaded or not, with Watch and
// Download video), Needs you (decisions and failures), Running (each run's step and time left,
// then the videos waiting to start in their order), and beside them what the schedules start
// next, this week's numbers and the templates to start from. Each region says when it is loading or failed, with Retry in place;
// nothing reads as empty before it loaded.
export function HomeRoute({
  startFrom,
}: {
  // How a template opens in Create (router.tsx hands in the Play session's hooks); without it
  // Home offers no templates.
  readonly startFrom?: TemplateStart;
} = {}): ReactElement {
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
  // A clock for the running steps' times; once a second is what the eye reads.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const templateChannel = useMemo(
    () => new Map((templates.data ?? []).map((one) => [one.id, one.channelId])),
    [templates.data],
  );
  const all = projects.data?.projects ?? [];
  const mine = all.filter((one) => current.includes(one.channelId));
  // Nothing of the person's own yet: the bundled samples are all there is.
  const firstTime = projects.data !== undefined && all.every((one) => one.sample === true);
  // The samples stand in for finished work until the person has finished a video of their own.
  const samples = all.filter((one) => one.sample === true);
  const showSamples = samples.length > 0 && !all.some(finishedWork);
  // Paused runs wait for the person, so they sit under Needs you, not Running. A run parked on
  // an agent's review goes on by itself, so it sits here.
  const running = mine.filter(runningNow);
  // Started and waiting their turn: listed in order under Running.
  const queued = mine.filter(queuedRun);
  // What the person's runs made, uploaded or not.
  const finished = mine.filter(finishedWork).toSorted(byFinished);
  // A step that failed beside another still waiting is listed here too, while the run reads by
  // that wait.
  const failed = mine.filter(failedRun);
  const mySchedules = (schedules.data ?? []).filter(
    (one) => one.deletedAt === null && current.includes(templateChannel.get(one.templateId)),
  );
  const held = mySchedules.filter(
    (one) => one.topicGeneration.mode === "hold" && one.topics.held > 0,
  );
  const upcoming = (calendar.data?.runs ?? []).filter((run) =>
    current.includes(templateChannel.get(run.templateId)),
  );
  const needsYou = mine.filter(waitsForPerson);
  const decisions: Decision[] = [
    ...needsYou
      .filter((one) => one.status !== "paused")
      .map((project) => ({
        kind: project.stopped === true ? ("stopped" as const) : ("waiting" as const),
        project,
      })),
    ...needsYou
      .filter((one) => one.status === "paused")
      .map((project) => ({ kind: "paused" as const, project })),
    ...held.map((schedule) => ({ kind: "held" as const, schedule })),
  ];
  const deciding = decisions.length + failed.length > 0;
  const active = running.length + queued.length > 0;
  // Upcoming runs only matter once there is a schedule; until the schedules answer, the
  // section holds its place.
  const showComingUp = schedules.data === undefined || mySchedules.length > 0;
  const myTemplates = (templates.data ?? []).filter((one) => current.includes(one.channelId));
  const retryProjects = (): void => {
    void projects.refetch();
  };

  return (
    <div data-tour="home">
      <PageHeader
        crumb={today.format(new Date())}
        title="Home"
        actions={
          <>
            <ChannelPicker variant="header" />
            {mySchedules.length === 0 ? null : (
              <ButtonLink to="/calendar" variant="quiet">
                Open calendar
              </ButtonLink>
            )}
          </>
        }
      />
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
              <LoadingBlock label="Loading your projects…" rows={3} rowClassName="h-16" />
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
              {firstTime ? <FirstVideo firstRun={firstRun.data} /> : null}
              {finished.length === 0 ? null : (
                <FinishedList
                  finished={finished}
                  primary={!deciding}
                  more={
                    <TextLink to="/projects" search={{ sort: "finished" }}>
                      {`See all ${String(finished.length)} finished in Projects`}
                    </TextLink>
                  }
                />
              )}
              {deciding ? <WorkList decisions={decisions} failed={failed} /> : null}
              {active ? (
                <section id="running" aria-label="Running">
                  <SectionHead
                    title="Running"
                    meta={[
                      running.length === 0 ? undefined : plural(running.length, "video", "videos"),
                      queued.length === 0 ? undefined : `${String(queued.length)} waiting`,
                    ]
                      .filter((part) => part !== undefined)
                      .join(" · ")}
                  />
                  {running.length === 0 ? null : (
                    <ul className="m-0 flex list-none flex-col gap-3 p-0">
                      {running.slice(0, 3).map((project) => (
                        <RunningProject key={project.id} project={project} now={now} />
                      ))}
                    </ul>
                  )}
                  <RunningMore running={running.length} queued={queued} projects={all} />
                </section>
              ) : null}
              {firstTime || finished.length > 0 || deciding || active ? null : (
                <EmptyState
                  title="Nothing is finished, waiting or running"
                  actions={
                    <ButtonLink to="/play" variant="primary">
                      Make a video
                    </ButtonLink>
                  }
                >
                  Finished videos show here with Watch and Download, and so does anything that needs
                  you.
                </EmptyState>
              )}
            </>
          )}
        </BoardColumn>
        <BoardColumn>
          {showSamples ? (
            <FinishedList finished={samples} title="Finished samples" primary={false} />
          ) : null}
          {showComingUp ? (
            <section aria-label="Coming up">
              <SectionHead title="Coming up" meta="Next 7 days" />
              <Autopilot channelId={current.channelId} />
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
          <ThisWeek channelId={current.channelId} />
          {startFrom === undefined ? null : (
            <StartFromTemplate templates={myTemplates} start={startFrom} />
          )}
          {/* Last, so its empty slot never opens a gap above the column's first section. */}
          <NewModelsSlot />
        </BoardColumn>
      </Board>
    </div>
  );
}
