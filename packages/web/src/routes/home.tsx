import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { CalendarIcon, PlusIcon } from "lucide-react";
import { type ReactElement, useEffect, useMemo, useState } from "react";
import { useApp } from "@/app-context";
import { ChannelPicker, useCurrentChannel } from "@/channels/current";
import { Board, BoardColumn } from "@/components/kit/board";
import { Button } from "@/components/kit/button";
import { EmptyState } from "@/components/kit/empty-state";
import { helpScope, InfoTip } from "@/components/kit/info-tip";
import { PageHeader } from "@/components/kit/layout";
import { SectionHead } from "@/components/kit/section-head";
import { ComingUp } from "@/home/coming-up";
import { FailedItem, HeldTopicsItem, isWaiting, PausedItem, WaitingItem } from "@/home/needs-you";
import { isReadyToUpload, ReadyItem } from "@/home/ready";
import { isQueued, RunningMore } from "@/home/running-more";
import { RunningProject } from "@/home/running-now";
import { ThisWeek } from "@/home/week";
import { onboardingKey, readFirstRun } from "@/onboarding/api";
import { projectsQuery } from "@/queries";
import { calendarQuery, schedulesQuery } from "@/schedules/api";
import { templatesQuery } from "@/templates/api";

const dayMs = 24 * 60 * 60_000;
const today = new Intl.DateTimeFormat(undefined, {
  weekday: "long",
  day: "numeric",
  month: "long",
});
// Enough to see what matters without the page turning into the projects list.
const shownPerSection = 4;

// Set once the first-run screen was opened in this tab, so coming back to Home stays here.
let welcomed = false;

// Home: what needs the person, what is running, what is coming up on the calendar, what is
// ready to upload and what this week cost, for the channel picked in the rail (or all).
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
  const paused = mine.filter((one) => one.status === "paused");
  const waiting = mine.filter(isWaiting);
  const failed = mine.filter((one) => one.status === "failed");
  // The bundled samples are finished videos too, but nobody uploads them.
  const samples = new Set(
    Object.values(firstRun.data?.samples ?? {}).filter((id): id is string => id !== null),
  );
  const ready = mine.filter((one) => isReadyToUpload(one) && !samples.has(one.id));
  const held = (schedules.data ?? []).filter(
    (one) =>
      one.deletedAt === null &&
      one.topicGeneration.mode === "hold" &&
      one.topics.held > 0 &&
      current.includes(templateChannel.get(one.templateId)),
  );
  const upcoming = (calendar.data?.runs ?? []).filter((run) =>
    current.includes(templateChannel.get(run.templateId)),
  );
  const needs = [
    ...waiting.map((project) => ({ kind: "waiting" as const, project })),
    ...paused.map((project) => ({ kind: "paused" as const, project })),
    ...held.map((schedule) => ({ kind: "held" as const, schedule })),
    ...failed.slice(0, shownPerSection).map((project) => ({ kind: "failed" as const, project })),
  ];
  const loading = projects.isPending;

  return (
    <div>
      <PageHeader
        display
        crumb={today.format(new Date())}
        title={current.channel?.name ?? "Home"}
        meta={current.channelId === null ? "Every channel" : undefined}
        actions={
          <>
            <Button asChild variant="secondary">
              <Link to="/calendar">
                <CalendarIcon aria-hidden="true" strokeWidth={1.75} />
                Open calendar
              </Link>
            </Button>
            <Button asChild variant="secondary">
              <Link to="/play">
                <PlusIcon aria-hidden="true" strokeWidth={1.75} />
                New video
              </Link>
            </Button>
          </>
        }
      />
      <div className="mb-5 flex items-end gap-1 md:hidden" {...helpScope}>
        <ChannelPicker className="min-w-0 flex-1" />
        <InfoTip id="home.channel" className="mb-[5px]" />
      </div>
      {projects.error === null ? null : (
        <p role="alert" className="m-0 mb-5 text-danger">
          {`Your projects didn't load: ${projects.error.message} Check that Slopify is still running, then reload the page.`}
        </p>
      )}
      <Board split="main-side">
        <BoardColumn>
          <section aria-label="Needs you">
            <SectionHead
              title="Needs you"
              info="home.needs-you"
              meta={
                loading
                  ? "Loading…"
                  : needs.length === 0
                    ? "Nothing is waiting for a decision"
                    : `${String(needs.length)} ${needs.length === 1 ? "thing is" : "things are"} waiting for you`
              }
            />
            {needs.length === 0 ? null : (
              <ul aria-label="Waiting for you" className="m-0 flex list-none flex-col gap-3 p-0">
                {needs.map((item, index) =>
                  item.kind === "waiting" ? (
                    <WaitingItem
                      key={item.project.id}
                      project={item.project}
                      primary={index === 0}
                    />
                  ) : item.kind === "paused" ? (
                    <PausedItem
                      key={item.project.id}
                      project={item.project}
                      primary={index === 0}
                    />
                  ) : item.kind === "held" ? (
                    <HeldTopicsItem
                      key={item.schedule.id}
                      schedule={item.schedule}
                      primary={index === 0}
                    />
                  ) : (
                    <FailedItem
                      key={item.project.id}
                      project={item.project}
                      primary={index === 0}
                    />
                  ),
                )}
              </ul>
            )}
          </section>
          <section id="running" aria-label="Running now">
            <SectionHead
              title="Running now"
              info="home.running"
              meta={
                running.length === 0
                  ? "Nothing is running"
                  : `${String(running.length)} ${running.length === 1 ? "video" : "videos"}`
              }
            />
            {running.length === 0 ? (
              loading || queued.length > 0 ? null : (
                <EmptyState title="Start the next video">
                  Pick a template and a topic on Play, or let a schedule start one.
                </EmptyState>
              )
            ) : (
              <ul className="m-0 flex list-none flex-col gap-3 p-0">
                {running.slice(0, 3).map((project) => (
                  <RunningProject key={project.id} project={project} now={now} />
                ))}
              </ul>
            )}
            <RunningMore running={running.length} queued={queued} />
          </section>
        </BoardColumn>
        <BoardColumn>
          <section aria-label="Coming up">
            <SectionHead title="Coming up" info="home.coming-up" meta="Next 7 days">
              <Button asChild variant="quiet" size="small">
                <Link to="/calendar">Calendar</Link>
              </Button>
            </SectionHead>
            {calendar.error !== null ? (
              <p className="m-0 text-small text-danger">
                {`The calendar didn't load: ${calendar.error.message} Reload the page to try again.`}
              </p>
            ) : upcoming.length === 0 ? (
              <p className="m-0 text-small text-ink-2">
                {calendar.isPending
                  ? "Loading…"
                  : "No scheduled runs this week. Plan some on the calendar."}
              </p>
            ) : (
              <ComingUp runs={upcoming.slice(0, 6)} />
            )}
          </section>
          <section aria-label="Ready to upload">
            <SectionHead
              title="Ready to upload"
              info="home.ready"
              meta={
                ready.length === 0
                  ? "Finished videos you haven't marked uploaded show here"
                  : `${String(ready.length)} finished and not marked uploaded`
              }
            />
            {ready.length === 0 ? null : (
              <ul className="m-0 flex list-none flex-col gap-4 p-0">
                {ready.slice(0, shownPerSection).map((project) => (
                  <ReadyItem key={project.id} project={project} />
                ))}
              </ul>
            )}
          </section>
          <section aria-label="This week">
            <SectionHead title="This week" info="home.this-week" meta="Since Monday" />
            <ThisWeek channelId={current.channelId} />
          </section>
        </BoardColumn>
      </Board>
    </div>
  );
}
