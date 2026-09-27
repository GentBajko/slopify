import type { ProjectSummary } from "@app/slices/admission/model.js";
import type { Prompt } from "@app/slices/library/model.js";
import { Link } from "@tanstack/react-router";
import { ChevronLeftIcon, EllipsisIcon } from "lucide-react";
import type { ReactElement } from "react";
import { Button, IconButton } from "@/components/kit/button";
import { PageHeader } from "@/components/kit/layout";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/kit/menu";
import { Status, type Tone } from "@/components/kit/status";
import { startedAt } from "@/lib/utils";

// The project's title row: the way back to Projects, the title, one meta line, and the
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
}: {
  readonly project: ProjectSummary;
  // Undefined until the library has arrived: a prompt cannot be called deleted just
  // because the list naming it has not loaded yet.
  readonly prompts: readonly Prompt[] | undefined;
  // The settings view is open.
  readonly editing: boolean;
  readonly onEdit: () => void;
  readonly more: readonly MoreAction[];
}): ReactElement {
  const state = statusOf(project.status);
  return (
    <PageHeader
      crumb={
        <Link to="/projects" className="inline-flex items-center gap-1 text-ink-3 hover:text-ink">
          <ChevronLeftIcon aria-hidden="true" strokeWidth={1.75} />
          Projects
        </Link>
      }
      title={project.title}
      meta={subtitle(project, prompts)}
      actions={
        <>
          <Status tone={state.tone}>
            {state.word}
            <span className="sr-only" role="status" aria-live="polite">
              {`Project: ${state.word}`}
            </span>
          </Status>
          <Button variant="quiet" aria-pressed={editing} onClick={onEdit}>
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

function statusOf(status: ProjectSummary["status"]): {
  readonly tone: Tone;
  readonly word: string;
} {
  switch (status) {
    case "running":
      return { tone: "running", word: "Running" };
    case "paused":
      return { tone: "waiting", word: "Paused" };
    case "failed":
      return { tone: "failed", word: "Failed" };
    case "partial":
      return { tone: "waiting", word: "Done with problems" };
    case "done":
      return { tone: "done", word: "Done" };
    case "canceled":
      return { tone: "off", word: "Canceled" };
    case "pending":
      return { tone: "off", word: "Queued" };
  }
}

// "Documentary dossier · 16:9 · started 21:14". The name is the run's own copy of it, so a
// template deleted since the run is still named, marked as gone.
function subtitle(project: ProjectSummary, prompts: readonly Prompt[] | undefined): string {
  const name = project.config.articlePrompt;
  const known = prompts === undefined || prompts.some((prompt) => prompt.name === name);
  const shown = name === undefined || name === "" ? undefined : known ? name : `${name} (deleted)`;
  return [shown, project.format, `started ${startedAt(project.createdAt)}`]
    .filter((part) => part !== undefined)
    .join(" · ");
}
