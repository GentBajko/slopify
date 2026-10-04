import type { ProjectSummary } from "@app/slices/admission/model.js";
import type { Prompt } from "@app/slices/library/model.js";
import { bookLabel } from "@app/slices/voices/model.js";
import { Link } from "@tanstack/react-router";
import { ChevronLeftIcon, EllipsisIcon, SlidersHorizontalIcon } from "lucide-react";
import type { ReactElement, ReactNode } from "react";
import { cameFrom } from "@/components/came-from";
import { Button, IconButton } from "@/components/kit/button";
import { InfoTip } from "@/components/kit/info-tip";
import { PageHeader } from "@/components/kit/layout";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/kit/menu";
import { Status } from "@/components/kit/status";
import { keptAsIs, projectStateLook } from "@/lib/state-words";
import { startedAt } from "@/lib/utils";

// The project's title row: the way back (to the list it was opened from), the title, one meta line, and the
// page's quiet actions. The one action the project needs next is not here: it is in the
// right rail (`next-action-view.tsx`). Rare actions sit behind More.
export interface MoreAction {
  readonly id: string;
  readonly label: string;
  readonly run: () => void;
  readonly disabled?: boolean;
  // A line above it in the menu: destructive actions sit apart.
  readonly apart?: boolean;
}

export function ProjectHeader({
  project,
  prompts,
  editing,
  onEdit,
  more,
  nextChapter,
  clock,
}: {
  readonly project: ProjectSummary;
  // A finished audiobook's "Make the next chapter"; absent hides the button.
  readonly nextChapter?:
    | {
        readonly run: () => void;
        readonly pending: boolean;
        readonly error?: string | undefined;
      }
    | undefined;
  // Undefined until the library has arrived: a prompt cannot be called deleted just
  // because the list naming it has not loaded yet.
  readonly prompts: readonly Prompt[] | undefined;
  // The settings view is open.
  readonly editing: boolean;
  readonly onEdit: () => void;
  readonly more: readonly MoreAction[];
  // The run clock, at the end of the meta line while a run goes.
  readonly clock?: ReactNode;
}): ReactElement {
  const state =
    project.status === "pending" && project.setAside === true
      ? keptAsIs
      : projectStateLook[project.status];
  // The way back goes where the project was opened from: Projects as it was filtered, Home,
  // the calendar or the channel.
  const origin = cameFrom();
  return (
    <PageHeader
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
      title={project.title}
      row
      meta={
        <span className="inline-flex flex-wrap items-center gap-x-1">
          {subtitle(project, prompts)}
          {clock}
        </span>
      }
      actions={
        <>
          <Status tone={state.tone}>
            {state.word}
            <span className="sr-only" role="status" aria-live="polite">
              {`Project: ${state.word}`}
            </span>
          </Status>
          {nextChapter !== undefined && finishedAudiobook(project) ? (
            <span className="inline-flex items-center gap-1">
              <Button variant="secondary" disabled={nextChapter.pending} onClick={nextChapter.run}>
                {nextChapter.pending ? "Making the next chapter…" : "Make the next chapter"}
              </Button>
              <InfoTip id="project.next-chapter" />
              {nextChapter.error === undefined ? null : (
                <span role="alert" className="max-w-[320px] text-small text-danger">
                  {nextChapter.error}
                </span>
              )}
            </span>
          ) : null}
          <Button variant="secondary" aria-pressed={editing} onClick={onEdit}>
            <SlidersHorizontalIcon aria-hidden="true" strokeWidth={1.75} />
            Edit settings
          </Button>
          <Menu modal={false}>
            <MenuTrigger asChild>
              <IconButton label="More project actions">
                <EllipsisIcon aria-hidden="true" strokeWidth={1.75} />
              </IconButton>
            </MenuTrigger>
            <MenuContent>
              {more.map((item) => (
                <MenuItemWithApart key={item.id} item={item} />
              ))}
            </MenuContent>
          </Menu>
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

function MenuItemWithApart({ item }: { readonly item: MoreAction }): ReactElement {
  return (
    <>
      {item.apart ? <MenuSeparator /> : null}
      <MenuItem {...(item.disabled ? { disabled: true } : {})} onSelect={() => item.run()}>
        {item.label}
      </MenuItem>
    </>
  );
}

// "Documentary dossier · 16:9 · started 21:14". The name is the run's own copy of it, so a
// template deleted since the run is still named, marked as gone.
function subtitle(project: ProjectSummary, prompts: readonly Prompt[] | undefined): string {
  const name = project.config.articlePrompt;
  const known = prompts === undefined || prompts.some((prompt) => prompt.name === name);
  const shown = name === undefined || name === "" ? undefined : known ? name : `${name} (deleted)`;
  const book = project.config.voices?.book;
  return [
    book === undefined ? undefined : bookLabel(book),
    shown,
    project.format,
    `started ${startedAt(project.createdAt)}`,
  ]
    .filter((part) => part !== undefined)
    .join(" · ");
}
