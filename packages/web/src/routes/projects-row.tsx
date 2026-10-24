import type { ProjectListing } from "@app/slices/admission/model.js";
import { bookLabel } from "@app/slices/voices/model.js";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { Trash2Icon } from "lucide-react";
import type { ReactElement, ReactNode } from "react";
import { fileUrl } from "@/api";
import { useApp } from "@/app-context";
import { QueueItemActions } from "@/components/batch-queue";
import { Button } from "@/components/kit/button";
import { FileLink, TextLink } from "@/components/kit/link";
import { ListRow } from "@/components/kit/list-row";
import { Meter } from "@/components/kit/stats";
import { Badge, Status } from "@/components/kit/status";
import { useToast } from "@/components/kit/toast";
import { finishedLine } from "@/home/finished-words";
import { ProjectThumb } from "@/home/project-thumb";
import { FailedStep, isReadyToUpload, listState } from "@/home/ready";
import { startedAt } from "@/lib/utils";
import { copySample } from "@/onboarding/api";
import { keys } from "@/queries";

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

// A row offers to take back its Mark uploaded for a day; after that the Uploaded state stays and
// the selection bar's Mark not uploaded reverses it. A permanent Undo on every uploaded row read
// as if something had just happened.
export const uploadUndoMs = 24 * 60 * 60 * 1000;

export function uploadUndoable(project: ProjectListing, now: number = Date.now()): boolean {
  if (project.uploadedAt === null) return false;
  return now - new Date(project.uploadedAt).getTime() < uploadUndoMs;
}

const finished = (project: ProjectListing): boolean =>
  project.status === "done" || project.status === "partial";

// One project on the Projects list: its picture, its name, then its state in words and what it
// is ("Ready to upload · 3:05 · 16:9 · video + 2 shorts + PDF · finished Sep 27" once finished,
// what it is made from and when it started before), and its actions in words: Open, Download
// video, Mark uploaded (Make my own copy on a sample), Delete.
export function ProjectRow({
  project,
  queue,
  check,
  onDelete,
  onUploaded,
  busy,
}: {
  readonly project: ProjectListing;
  // Its place among the videos waiting in the video queue, when it waits there: the row then
  // moves it Earlier or Later, or Removes it, in place of Delete.
  readonly queue?: { readonly place: number; readonly waiting: number };
  // The row's selection checkbox.
  readonly check: ReactNode;
  readonly onDelete: () => void;
  readonly onUploaded: (uploaded: boolean) => void;
  readonly busy: boolean;
}): ReactElement {
  const { api } = useApp();
  const state = listState(project);
  // The server refuses a delete while the project is running, so a running row offers none.
  const running = project.status === "running";
  const sample = project.sample === true;
  const meta = finished(project)
    ? finishedLine(project)
    : `${madeOf(project)} · started ${startedAt(project.createdAt)}`;
  return (
    <ListRow
      lead={
        <>
          {check}
          <ProjectThumb projectId={project.id} className="sl-projects__thumb" />
        </>
      }
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
          {project.outdated === true ? <Badge tone="waiting">Outdated</Badge> : null}
        </span>
      }
      meta={
        <span className="flex flex-col gap-1">
          <span className="flex min-w-0 items-baseline gap-2">
            <Status tone={state.tone} className="shrink-0">
              {state.word}
              <span className="sr-only" role="status" aria-live="polite">
                {`${project.title}: ${state.word}`}
              </span>
            </Status>
            <span className="min-w-0 truncate" title={meta}>
              {meta}
              {project.status === "partial" ? (
                <>
                  {" · "}
                  <FailedStep project={project} />
                </>
              ) : null}
            </span>
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
          <TextLink
            to="/projects/$projectId"
            params={{ projectId: project.id }}
            aria-label={`Open ${project.title}`}
            className="px-1 text-small"
          >
            Open
          </TextLink>
          {project.outputs?.video === true && finished(project) ? (
            <FileLink
              href={fileUrl(api, project.id, "video")}
              download
              variant="secondary"
              size="small"
              aria-label={`Download video: ${project.title}`}
            >
              Download video
            </FileLink>
          ) : null}
          {sample ? (
            <CopySample project={project} />
          ) : isReadyToUpload(project) ? (
            <Button
              variant="quiet"
              size="small"
              aria-label={`Mark uploaded: ${project.title}`}
              disabled={busy}
              disabledReason="Saving…"
              onClick={() => onUploaded(true)}
            >
              Mark uploaded
            </Button>
          ) : uploadUndoable(project) ? (
            <Button
              variant="quiet"
              size="small"
              aria-label={`Undo upload mark: ${project.title}`}
              disabled={busy}
              disabledReason="Saving…"
              onClick={() => onUploaded(false)}
            >
              Undo upload mark
            </Button>
          ) : null}
          {queue === undefined ? null : (
            <QueueItemActions
              projectId={project.id}
              title={project.title}
              place={queue.place}
              waiting={queue.waiting}
            />
          )}
          {running || queue !== undefined ? null : (
            <Button
              variant="quiet"
              size="small"
              aria-label={`Delete ${project.title}`}
              onClick={onDelete}
            >
              <Trash2Icon aria-hidden="true" strokeWidth={1.75} className="size-[14px]" />
              Delete
            </Button>
          )}
        </>
      }
    />
  );
}

// A sample's own action: Make my own copy, an ordinary project to edit and remake; the sample
// stays as it came. The copy opens once made.
function CopySample({ project }: { readonly project: ProjectListing }): ReactElement {
  const { api } = useApp();
  const client = useQueryClient();
  const navigate = useNavigate();
  const notify = useToast();
  const copy = useMutation({
    mutationFn: () => copySample(api, project.id),
    onSuccess: async ({ projectId }) => {
      await client.invalidateQueries({ queryKey: keys.projects });
      await navigate({ to: "/projects/$projectId", params: { projectId } });
    },
    onError: (error: Error) =>
      notify(
        `The copy of ${project.title} wasn't made: ${error.message} Press Make my own copy again.`,
        "error",
      ),
  });
  return (
    <Button
      variant="quiet"
      size="small"
      aria-label={`Make my own copy of ${project.title}`}
      disabled={copy.isPending}
      disabledReason="Copying…"
      onClick={() => copy.mutate()}
    >
      {copy.isPending ? "Copying…" : "Make my own copy"}
    </Button>
  );
}

// Skeletons match the final layout's shape.
export function SkeletonRows(): ReactElement {
  return (
    <ul aria-label="Loading projects" className="sl-list m-0 list-none p-0">
      {[0, 1, 2, 3, 4, 5].map((index) => (
        <li key={index} className="sl-row" data-slot="skeleton-row">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <span className="h-9 w-16 shrink-0 rounded-control bg-sunken" />
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <span className="h-3 w-2/5 rounded-control bg-sunken" />
              <span className="h-[10px] w-1/4 rounded-control bg-sunken" />
            </div>
          </div>
          <span className="h-[10px] w-16 rounded-control bg-sunken" />
        </li>
      ))}
    </ul>
  );
}
