import type { ProjectSummary, Stage } from "@app/slices/admission/model.js";
import { bookLabel } from "@app/slices/voices/model.js";
import { Link } from "@tanstack/react-router";
import { ChevronLeftIcon, SlidersHorizontalIcon, XIcon } from "lucide-react";
import type { ReactElement, ReactNode } from "react";
import { cameFrom } from "@/components/came-from";
import { Button } from "@/components/kit/button";
import { PageHeader } from "@/components/kit/layout";
import { Badge, Status } from "@/components/kit/status";
import { projectStateOf } from "@/lib/state-words";
import { startedAt } from "@/lib/utils";
import { runPosition } from "./measured-eta.js";
import { stageName } from "./summary.js";

// The project's title row, one line: the way back (to the list it was opened from), the title,
// its state with when it finished, how long it took and its channel (while it runs, where the
// run stands beside its clock), then the one thing to do next (the page's only lime button)
// and Edit settings. The rest of what can be done to the project (Rename, Delete…) is listed
// in words in the status column (`ProjectActions`), not behind a menu whose name says nothing.
export interface ProjectAction {
  readonly id: string;
  readonly label: string;
  readonly run: () => void;
  // Why it cannot act now, said on hover and to a screen reader; it is drawn dim.
  readonly disabledReason?: string | undefined;
  // Deletes or cancels: it sits apart, below the others.
  readonly apart?: boolean;
}

export function ProjectHeader({
  project,
  progress,
  stages,
  channel,
  uploadedAt,
  primary,
  editing,
  unsaved = false,
  onEdit,
  clock,
}: {
  readonly project: ProjectSummary;
  // The run's share done (`progressOf` over its steps), which tells a held project from a
  // queued one.
  readonly progress: number;
  // The run's steps, for when it finished and how long it took.
  readonly stages: readonly Stage[];
  // The channel's name, when there is more than one channel to tell apart.
  readonly channel?: string | undefined;
  // When the finished video was marked uploaded.
  readonly uploadedAt?: string | null | undefined;
  // The project's next action, the one primary button; absent when nothing waits on the person.
  readonly primary?: ReactNode;
  // The settings view is open.
  readonly editing: boolean;
  // A settings draft waits unsaved: said beside Edit settings while the view is shut.
  readonly unsaved?: boolean;
  // Opens the settings, or, open, closes them.
  readonly onEdit: () => void;
  // The run clock, at the end of the meta line while a run goes.
  readonly clock?: ReactNode;
}): ReactElement {
  const state = projectStateOf({ ...project, progress });
  // The way back goes where the project was opened from: Projects as it was filtered, Home,
  // the calendar or the channel.
  const origin = cameFrom();
  return (
    <PageHeader
      className="sl-project__header"
      crumb={
        <Link
          to={origin.to}
          search={origin.search}
          className="inline-flex items-center gap-1 text-ink-3 hover:text-ink"
        >
          <ChevronLeftIcon aria-hidden="true" strokeWidth={1.75} />
          {origin.label}
        </Link>
      }
      // The whole title on hover when the row cuts it short.
      title={<span title={project.title}>{project.title}</span>}
      meta={
        <span className="sl-project__meta">
          <Status tone={state.tone}>
            {state.word}
            <span className="sr-only" role="status" aria-live="polite">
              {`Project: ${state.word}`}
            </span>
          </Status>
          {facts(project, stages, channel, uploadedAt).map((fact) => (
            <span key={fact}>
              <span aria-hidden="true">· </span>
              {fact}
            </span>
          ))}
          {clock}
        </span>
      }
      actions={
        <>
          {primary}
          {unsaved && !editing ? <Badge tone="waiting">Unsaved changes</Badge> : null}
          {/* Named for what a press does now: open, it closes the settings. */}
          <Button variant="secondary" onClick={onEdit}>
            {editing ? (
              <XIcon aria-hidden="true" strokeWidth={1.75} />
            ) : (
              <SlidersHorizontalIcon aria-hidden="true" strokeWidth={1.75} />
            )}
            {editing ? "Close settings" : "Edit settings"}
          </Button>
        </>
      }
    />
  );
}

// An audiobook whose run finished (with or without problems) can be followed by its next chapter.
export function finishedAudiobook(project: ProjectSummary): boolean {
  return (
    project.config.voices?.format === "audiobook" &&
    (project.status === "done" || project.status === "partial")
  );
}

// What can be done to the project besides its next action, each named for its result and on
// show (Rename…, Save as template…, Mark uploaded, Delete project…), in the status column under
// the cost: nothing needs a press to find out what it is. Deleting or cancelling sits apart.
export function ProjectActions({
  actions,
}: {
  readonly actions: readonly ProjectAction[];
}): ReactElement | null {
  if (actions.length === 0) return null;
  const main = actions.filter((action) => action.apart !== true);
  const apart = actions.filter((action) => action.apart === true);
  const button = (action: ProjectAction) => (
    <li key={action.id}>
      <Button
        variant="quiet"
        size="small"
        className={action.apart === true ? "text-danger" : undefined}
        disabled={action.disabledReason !== undefined}
        disabledReason={action.disabledReason}
        focusableWhenDisabled
        onClick={action.run}
      >
        {action.label}
      </Button>
    </li>
  );
  return (
    <section aria-label="Project actions" className="sl-project-actions">
      {main.length === 0 ? null : <ul>{main.map(button)}</ul>}
      {apart.length === 0 ? null : <ul>{apart.map(button)}</ul>}
    </section>
  );
}

// "Audiobook", "Sea Tales, chapter 3", "finished Sep 27 17:18, 3 min", "My channel", "uploaded
// Sep 28": what a person checks on a project each morning, after its state. An audiobook or a
// podcast says first what it is, since its page otherwise reads like a video's. While a step
// runs, the last fact is where the run stands, as Home says it: "Step 2 of 4 · Narration · about
// 4 min left on this step", the time measured as Progress measures it (`measured-eta.ts`).
function facts(
  project: ProjectSummary,
  stages: readonly Stage[],
  channel: string | undefined,
  uploadedAt: string | null | undefined,
): readonly string[] {
  const book = project.config.voices?.book;
  const finished = project.status === "done" || project.status === "partial";
  const end = finishedAt(stages);
  const took = runLength(stages);
  return [
    project.config.voices === undefined ? undefined : listeningKinds[project.config.voices.format],
    book === undefined ? undefined : bookLabel(book),
    finished && end !== undefined
      ? `finished ${startedAt(end)}${took === undefined ? "" : `, ${took}`}`
      : `started ${startedAt(runStart(stages) ?? project.createdAt)}`,
    channel,
    uploadedAt === null || uploadedAt === undefined
      ? undefined
      : `uploaded ${startedAt(uploadedAt)}`,
    runPosition(
      stages.filter((stage) => stage.source !== "off" && stage.state !== "skipped"),
      Date.now(),
      (kind) => stageName(kind, project.config),
    ),
  ].filter((fact): fact is string => fact !== undefined && fact !== "");
}

const listeningKinds: Readonly<
  Record<NonNullable<ProjectSummary["config"]["voices"]>["format"], string>
> = {
  audiobook: "Audiobook",
  drama: "Radio drama",
  podcast: "Podcast episode",
  interview: "Podcast episode",
};

const timeOf = (iso: string | null): number | undefined => {
  if (iso === null) return undefined;
  const at = Date.parse(iso);
  return Number.isFinite(at) ? at : undefined;
};

// When the run's last step finished.
export function finishedAt(stages: readonly Stage[]): string | undefined {
  const ends = stages.flatMap((stage) => {
    const at = timeOf(stage.finishedAt);
    return at === undefined ? [] : [at];
  });
  return ends.length === 0 ? undefined : new Date(Math.max(...ends)).toISOString();
}

// When the run now going (or stopped) began: the first step it is making, and before it the
// steps that ran one after another up to it. A remake of the video days after the first run
// starts at its own render, not when the project (or the copy) was made. Undefined when no step
// still to finish has started.
export function runStart(stages: readonly Stage[]): string | undefined {
  const started = stages.flatMap((stage) => {
    const at = timeOf(stage.startedAt);
    return at === undefined ? [] : [{ stage, at }];
  });
  const going = started.filter(({ stage }) => stage.state !== "done" && stage.state !== "provided");
  if (going.length === 0) return undefined;
  let start = Math.min(...going.map(({ at }) => at));
  // A step that finished at most a few minutes before the run's start was part of it.
  const before = started
    .filter(({ stage }) => stage.state === "done" || stage.state === "provided")
    .toSorted((a, b) => b.at - a.at);
  for (const { stage, at } of before) {
    const end = timeOf(stage.finishedAt);
    if (end === undefined || end > start || start - end > chainGapMs) continue;
    start = Math.min(start, at);
  }
  return new Date(start).toISOString();
}

// Steps of one run follow each other within seconds; a later remake comes minutes or days on.
const chainGapMs = 5 * 60_000;

// "3 min", "41 s", "1 h 12 min": from the first step's start to the last one's end.
export function runLength(stages: readonly Stage[]): string | undefined {
  const starts = stages.flatMap((stage) => timeOf(stage.startedAt) ?? []);
  const ends = stages.flatMap((stage) => timeOf(stage.finishedAt) ?? []);
  if (starts.length === 0 || ends.length === 0) return undefined;
  const seconds = Math.round((Math.max(...ends) - Math.min(...starts)) / 1000);
  if (seconds < 1) return undefined;
  if (seconds < 60) return `${String(seconds)} s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${String(minutes)} min`;
  return `${String(Math.floor(minutes / 60))} h ${String(minutes % 60)} min`;
}
