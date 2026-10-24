import type { ProjectSummary, Stage } from "@app/slices/admission/model.js";
import { bookLabel } from "@app/slices/voices/model.js";
import { Link } from "@tanstack/react-router";
import { ChevronDownIcon, ChevronLeftIcon, SlidersHorizontalIcon } from "lucide-react";
import { type ReactElement, type ReactNode, useRef } from "react";
import { cameFrom } from "@/components/came-from";
import { Button } from "@/components/kit/button";
import { PageHeader } from "@/components/kit/layout";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/kit/menu";
import { Badge, Status } from "@/components/kit/status";
import { projectStateOf } from "@/lib/state-words";
import { startedAt } from "@/lib/utils";

// The project's title row, one line: the way back (to the list it was opened from), the title,
// its state with when it finished, how long it took and its channel, then the one thing to do
// next (the page's only lime button), Edit settings and a worded More for the rest.
export interface MoreAction {
  readonly id: string;
  readonly label: string;
  readonly run: () => void;
  // A row that cannot act says why in its own words, and is drawn dim.
  readonly disabled?: boolean;
  // A line above it in the menu: destructive actions sit apart.
  readonly apart?: boolean;
  // It puts the cursor somewhere else (Rename), so the menu does not take it back on close.
  readonly movesFocus?: boolean;
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
  more,
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
  readonly onEdit: () => void;
  readonly more: readonly MoreAction[];
  // The run clock, at the end of the meta line while a run goes.
  readonly clock?: ReactNode;
}): ReactElement {
  const state = projectStateOf({ ...project, progress });
  const moved = useRef(false);
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
          <Button variant="secondary" aria-pressed={editing} onClick={onEdit}>
            <SlidersHorizontalIcon aria-hidden="true" strokeWidth={1.75} />
            Edit settings
          </Button>
          {more.length === 0 ? null : (
            <Menu modal={false}>
              <MenuTrigger asChild>
                <Button variant="secondary">
                  More
                  <ChevronDownIcon aria-hidden="true" strokeWidth={1.75} />
                </Button>
              </MenuTrigger>
              <MenuContent
                onCloseAutoFocus={(event) => {
                  if (moved.current) event.preventDefault();
                  moved.current = false;
                }}
              >
                {more.map((item) => (
                  <MenuItemWithApart
                    key={item.id}
                    item={item}
                    onPick={() => {
                      moved.current = item.movesFocus === true;
                    }}
                  />
                ))}
              </MenuContent>
            </Menu>
          )}
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

function MenuItemWithApart({
  item,
  onPick,
}: {
  readonly item: MoreAction;
  readonly onPick: () => void;
}): ReactElement {
  return (
    <>
      {item.apart ? <MenuSeparator /> : null}
      <MenuItem
        {...(item.disabled ? { disabled: true } : {})}
        onSelect={() => {
          onPick();
          item.run();
        }}
      >
        {item.label}
      </MenuItem>
    </>
  );
}

// "Sea Tales, chapter 3", "finished Sep 27 17:18, 3 min", "My channel", "uploaded Sep 28": what
// a person checks on a project each morning, after its state.
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
    book === undefined ? undefined : bookLabel(book),
    finished && end !== undefined
      ? `finished ${startedAt(end)}${took === undefined ? "" : `, ${took}`}`
      : `started ${startedAt(project.createdAt)}`,
    channel,
    uploadedAt === null || uploadedAt === undefined
      ? undefined
      : `uploaded ${startedAt(uploadedAt)}`,
  ].filter((fact): fact is string => fact !== undefined && fact !== "");
}

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
