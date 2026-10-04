import type { ProjectListing } from "@app/slices/admission/model.js";
import { bookLabel } from "@app/slices/voices/model.js";
import { Link } from "@tanstack/react-router";
import { Trash2Icon } from "lucide-react";
import type { ReactElement, ReactNode } from "react";
import { Button, IconButton } from "@/components/kit/button";
import { InfoTip } from "@/components/kit/info-tip";
import { ListRow } from "@/components/kit/list-row";
import { Meter } from "@/components/kit/stats";
import { Badge, Status } from "@/components/kit/status";
import { isWaiting } from "@/home/needs-you";
import { isReadyToUpload } from "@/home/ready";
import { keptAsIs, projectStateLook, type StateLook } from "@/lib/state-words";
import { startedAt } from "@/lib/utils";
import { limitWaitLine } from "@/project/limit-wait";

// The state in words, with its lamp.
export function stateOf(project: ProjectListing): StateLook {
  if (isWaiting(project)) return { tone: "waiting", word: "Waiting for you" };
  if (project.status === "pending" && project.setAside === true) return keptAsIs;
  // Running, but a step waits for a CLI plan to reset: "Waiting for Codex limits (resets at 14:00)".
  const limits = project.status === "running" ? limitWaitLine(project.limitWaits) : undefined;
  return limits === undefined
    ? projectStateLook[project.status]
    : { tone: "waiting", word: limits };
}

// "Documentary dossier · 16:9". The prompt name is the run's own copy of it; a run that
// generated no article from a template names only its format.
export function madeOf(project: ProjectListing): string {
  const prompt = project.config.articlePrompt;
  const book = project.config.voices?.book;
  return [
    book === undefined ? undefined : bookLabel(book),
    prompt === undefined || prompt === "" ? undefined : prompt,
    project.format,
  ]
    .filter((part) => part !== undefined)
    .join(" · ");
}

// A row offers to take back its Mark uploaded for a day; after that the Uploaded badge stays and
// the selection bar's Mark not uploaded reverses it. A permanent Undo on every uploaded row read
// as if something had just happened.
export const uploadUndoMs = 24 * 60 * 60 * 1000;

export function uploadUndoable(project: ProjectListing, now: number = Date.now()): boolean {
  if (project.uploadedAt === null) return false;
  return now - new Date(project.uploadedAt).getTime() < uploadUndoMs;
}

export function ProjectRow({
  project,
  sample,
  check,
  onDelete,
  onUploaded,
  busy,
}: {
  readonly project: ProjectListing;
  readonly sample: boolean;
  // The row's selection checkbox.
  readonly check: ReactNode;
  readonly onDelete: () => void;
  readonly onUploaded: (uploaded: boolean) => void;
  readonly busy: boolean;
}): ReactElement {
  const state = stateOf(project);
  // The server refuses a delete while the project is running, so the button says why instead.
  const running = project.status === "running";
  const meta = `${madeOf(project)} · started ${startedAt(project.createdAt)}${
    project.views === undefined
      ? ""
      : ` · ${project.views.toLocaleString()} views${project.ctr === undefined ? "" : ` · ${String(project.ctr)}% CTR`}`
  }`;
  return (
    <ListRow
      lead={check}
      title={
        <span className="flex min-w-0 items-center gap-2">
          {/* The row truncates a long name; the whole name is the link's tooltip. */}
          <Link
            to="/projects/$projectId"
            params={{ projectId: project.id }}
            title={project.title}
            className="min-w-0 truncate"
          >
            {project.title}
          </Link>
          {sample ? <Badge>Sample</Badge> : null}
        </span>
      }
      meta={
        <span className="flex flex-col gap-1">
          <span className="truncate" title={meta}>
            {meta}
          </span>
          {running ? (
            <Meter
              progress
              value={project.progress}
              label={`${project.title} progress`}
              valueText={`${String(Math.round(project.progress * 100))}% done`}
              className="max-w-[240px]"
            />
          ) : null}
        </span>
      }
      actions={
        <>
          <Status tone={state.tone}>
            {state.word}
            <span className="sr-only" role="status" aria-live="polite">
              {`${project.title}: ${state.word}`}
            </span>
          </Status>
          {isReadyToUpload(project) ? (
            <>
              <Button
                variant="quiet"
                size="small"
                disabled={busy}
                disabledReason="Saving…"
                onClick={() => onUploaded(true)}
              >
                Mark uploaded
              </Button>
              <InfoTip id="project.mark-uploaded" />
            </>
          ) : project.uploadedAt !== null ? (
            <>
              <Badge>Uploaded</Badge>
              {uploadUndoable(project) ? (
                <Button
                  variant="quiet"
                  size="small"
                  aria-label={`Undo upload mark: ${project.title}`}
                  title="Puts it back on Ready to upload. Offered for a day after marking."
                  disabled={busy}
                  disabledReason="Saving…"
                  onClick={() => onUploaded(false)}
                >
                  Undo upload mark
                </Button>
              ) : null}
            </>
          ) : null}
          <IconButton
            label={`Delete ${project.title}`}
            size="small"
            disabled={running}
            focusableWhenDisabled
            disabledReason="Cancel the run first, then delete it."
            onClick={onDelete}
          >
            <Trash2Icon aria-hidden="true" strokeWidth={1.75} />
          </IconButton>
        </>
      }
    />
  );
}

// Skeletons match the final layout's shape.
export function SkeletonRows(): ReactElement {
  return (
    <ul aria-label="Loading projects" className="sl-list m-0 list-none p-0">
      {[0, 1, 2, 3, 4, 5].map((index) => (
        <li key={index} className="sl-row" data-slot="skeleton-row">
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <span className="h-3 w-2/5 rounded-control bg-sunken" />
            <span className="h-[10px] w-1/4 rounded-control bg-sunken" />
          </div>
          <span className="h-[10px] w-16 rounded-control bg-sunken" />
        </li>
      ))}
    </ul>
  );
}
