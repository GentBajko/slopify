import type { CalendarRun } from "@app/slices/schedules/schema.js";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { GripVerticalIcon } from "lucide-react";
import { type DragEvent, type KeyboardEvent, type ReactElement, useState } from "react";
import { useApp } from "@/app-context";
import { Button } from "@/components/kit/button";
import { ButtonLink, TextLink } from "@/components/kit/link";
import { hitArea, hitTarget } from "@/components/kit/list-row";
import { Status } from "@/components/kit/status";
import { cn } from "@/lib/utils";
import { calendarKey, prepareTopic } from "@/schedules/api";
import { projectLook } from "./attention";
import { type Day, runTitle } from "./plan";

// One day of Calendar's weeks: its runs as chips that can be dragged to another day (or moved
// with Alt+arrow keys), and the projects that ran on it.

const dayLabel = new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric" });
const fullDay = new Intl.DateTimeFormat(undefined, { dateStyle: "full" });
const time = new Intl.DateTimeFormat(undefined, { timeStyle: "short" });

export function DayCell({
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
      title={movable ? "Drag to another day, or press Alt+arrow keys" : undefined}
      className={cn("sl-cal-item", movable && "sl-cal-item--movable")}
    >
      <span className="flex items-center gap-1 text-label text-ink-3 tabular-nums">
        {run.index === null ? null : (
          // The grip says the chip can be picked up; the title attribute says how.
          <GripVerticalIcon
            aria-hidden="true"
            strokeWidth={1.75}
            className="size-3 shrink-0 text-ink-3"
          />
        )}
        {time.format(new Date(run.at))}
      </span>
      <b className={cn("text-small", run.topic === null && "font-normal text-ink-2")}>{title}</b>
      <TextLink
        to="/calendar"
        search={{ tab: "schedules", schedule: run.scheduleId }}
        className="self-start text-label"
        draggable={false}
      >
        {run.scheduleName}
      </TextLink>
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
export function PrepareRun({
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
