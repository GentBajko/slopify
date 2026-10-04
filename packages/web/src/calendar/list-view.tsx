import type { CalendarRun } from "@app/slices/schedules/schema.js";
import { Link } from "@tanstack/react-router";
import { ArrowDownIcon, ArrowUpIcon } from "lucide-react";
import { type ReactElement, useState } from "react";
import { Button, IconButton } from "@/components/kit/button";
import { helpScope, InfoTip } from "@/components/kit/info-tip";
import { ButtonLink, TextLink } from "@/components/kit/link";
import { List, ListRow } from "@/components/kit/list-row";
import { SectionHead } from "@/components/kit/section-head";
import { Status } from "@/components/kit/status";
import { PrepareUpload } from "@/studio/prepare-upload";
import { type CalendarProject, projectLook } from "./attention";
import { PrepareRun } from "./day-cell";
import { type Day, runTitle } from "./plan";

// Calendar's list view: every planned day as a list, each topic with the same moves dragging
// gives (earlier, later, another day, another schedule) as buttons.

const fullDay = new Intl.DateTimeFormat(undefined, { dateStyle: "full" });
const time = new Intl.DateTimeFormat(undefined, { timeStyle: "short" });
const when = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

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

export function ListView({
  days,
  busy,
  schedules,
  onStep,
  onMove,
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
  // To another run of the same schedule: the topic takes that run's place, as a drop does.
  readonly onMove: (run: CalendarRun, target: CalendarRun) => void;
  readonly onTransfer: (run: CalendarRun, targetId: string) => void;
}): ReactElement {
  const ordered = [...days.values()].sort((a, b) => a.key.localeCompare(b.key));
  if (ordered.length === 0)
    return (
      <p className="m-0 text-ink-2">
        Nothing is planned in these weeks. Add topics with Add to calendar, or create a schedule on
        the{" "}
        <Link to="/calendar" search={{ tab: "schedules" }}>
          Schedules
        </Link>{" "}
        tab.
      </p>
    );
  const runs = ordered.flatMap((day) => day.runs);
  const targets = schedules.filter(
    (one) => one.deletedAt === null && (one.status === "active" || one.status === "paused"),
  );
  return (
    <div className="flex flex-col gap-6" {...helpScope}>
      <p className="m-0 flex items-center gap-1 text-small text-ink-2">
        Move a topic earlier, later, to another day or to another schedule from its row.
        <InfoTip id="planning.calendar.move" className="-my-1" />
      </p>
      {ordered.map((day) => (
        <section key={day.key} aria-label={fullDay.format(day.date)}>
          <SectionHead title={fullDay.format(day.date)} as="h3" />
          <List label={`Planned on ${fullDay.format(day.date)}`}>
            {day.runs.map((run) => {
              const title = runTitle(run);
              const others = targets.filter((one) => one.id !== run.scheduleId);
              const days = runs.filter(
                (other) =>
                  other.scheduleId === run.scheduleId &&
                  other.index !== null &&
                  other.index !== run.index,
              );
              return (
                <ListRow
                  key={`${run.scheduleId}-${run.at}`}
                  title={title}
                  meta={
                    <>
                      {time.format(new Date(run.at))} ·{" "}
                      <TextLink
                        to="/calendar"
                        search={{ tab: "schedules", schedule: run.scheduleId }}
                      >
                        {run.scheduleName}
                      </TextLink>
                      {run.templateName === null ? null : (
                        <>
                          {" · "}
                          <TextLink to="/templates" search={{ item: run.templateId }}>
                            {run.templateName}
                          </TextLink>
                        </>
                      )}
                      {run.paused ? " · Paused" : ""}
                    </>
                  }
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
                        {others.length === 0 && days.length === 0 ? null : (
                          <MoveTo
                            title={title}
                            busy={busy}
                            days={days}
                            schedules={others}
                            onDay={(target) => onMove(run, target)}
                            onSchedule={(targetId) => onTransfer(run, targetId)}
                          />
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

// Move to…: another day of the same schedule or the end of another schedule's queue. The pick
// waits for Move, since some browsers fire a select's change on every arrow key.
function MoveTo({
  title,
  busy,
  days,
  schedules,
  onDay,
  onSchedule,
}: {
  readonly title: string;
  readonly busy: boolean;
  readonly days: readonly CalendarRun[];
  readonly schedules: readonly { readonly id: string; readonly name: string }[];
  readonly onDay: (target: CalendarRun) => void;
  readonly onSchedule: (scheduleId: string) => void;
}): ReactElement {
  const [pick, setPick] = useState("");
  const move = () => {
    const [kind, value] = pick.split(":");
    const target = days.find((one) => String(one.index) === value);
    if (kind === "day" && target !== undefined) onDay(target);
    if (kind === "schedule" && value !== undefined) onSchedule(value);
    setPick("");
  };
  return (
    <span className="flex items-center gap-1">
      <select
        aria-label={`Move ${title} to…`}
        className="sl-select h-8 w-auto text-small"
        value={pick}
        disabled={busy}
        onChange={(event) => setPick(event.target.value)}
      >
        <option value="">Move to…</option>
        {days.length === 0 ? null : (
          <optgroup label="Another day">
            {days.map((one) => (
              <option key={one.at} value={`day:${String(one.index)}`}>
                {when.format(new Date(one.at))}
              </option>
            ))}
          </optgroup>
        )}
        {schedules.length === 0 ? null : (
          <optgroup label="End of another schedule">
            {schedules.map((one) => (
              <option key={one.id} value={`schedule:${one.id}`}>
                {one.name}
              </option>
            ))}
          </optgroup>
        )}
      </select>
      <Button size="small" variant="secondary" disabled={busy || pick === ""} onClick={move}>
        Move
      </Button>
    </span>
  );
}
