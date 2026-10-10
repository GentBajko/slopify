import type { ProjectListing } from "@app/slices/admission/model.js";
import { stoppedWord } from "@app/slices/admission/state-words.js";
import type { ScheduleSummary } from "@app/slices/schedules/model.js";
import { LayersIcon } from "lucide-react";
import type { ReactElement } from "react";
import { Button } from "@/components/kit/button";
import { ButtonLink } from "@/components/kit/link";
import { hitTarget } from "@/components/kit/list-row";
import { Status } from "@/components/kit/status";
import { stoppedLines } from "@/project/next-action";
import { useProjectActions } from "@/project/use-actions";
import { ProjectThumb } from "./project-thumb.js";
import { useKeepAsIs } from "./use-keep-as-is.js";
import { projectLink, WorkItem } from "./work-item.js";

// Home's "Needs you": runs holding for a review or stopped before they finished, schedules
// holding suggested topics, and runs that failed with the one thing that fixes them. Only the
// first item's action is primary; the accent is spent once in the area. The held review and
// the failed run each have their own file (`waiting-item.tsx`, `failed-item.tsx`).

export function HeldTopicsItem({
  schedule,
  primary,
}: {
  readonly schedule: ScheduleSummary;
  readonly primary: boolean;
}): ReactElement {
  const count = schedule.topics.held;
  return (
    <WorkItem
      lead={
        <div className="sl-media__frame flex items-center justify-center bg-sunken text-info">
          <LayersIcon aria-hidden="true" strokeWidth={1.75} className="size-7" />
        </div>
      }
      status={
        <Status tone="info">{`${String(count)} new ${count === 1 ? "topic" : "topics"}`}</Status>
      }
      title={schedule.name}
      detail="Queue the ones you want and reject the rest."
      action={
        <ButtonLink
          to="/calendar"
          variant={primary ? "primary" : "secondary"}
          className={hitTarget}
        >
          Review topics
        </ButtonLink>
      }
    />
  );
}

// A run a restart stopped before it finished (`stopped`, `reviews/holds.ts`): nothing moves it
// on but Continue the run, offered here as on its page.
export function StoppedItem({
  project,
  primary,
}: {
  readonly project: ProjectListing;
  readonly primary: boolean;
}): ReactElement {
  const actions = useProjectActions(project.id);
  const keep = useKeepAsIs(project);
  return (
    <WorkItem
      lead={<ProjectThumb projectId={project.id} />}
      status={<Status tone="waiting">{stoppedWord}</Status>}
      title={projectLink(project)}
      detail={
        actions.refusal === undefined
          ? `${stoppedLines.title} ${stoppedLines.why}`
          : `It didn't continue: ${actions.refusal.message}`
      }
      action={
        <>
          <Button
            variant={primary ? "primary" : "secondary"}
            disabled={actions.pending}
            disabledReason="Continuing…"
            onClick={() => actions.run({ kind: "resume" })}
          >
            {actions.pending ? "Continuing…" : "Continue the run"}
          </Button>
          <Button
            variant="quiet"
            disabled={keep.isPending}
            disabledReason="Saving…"
            onClick={() => keep.mutate(true)}
          >
            Keep as is
          </Button>
        </>
      }
    />
  );
}

// A run the person paused: nothing more happens until they continue it on the project, so it
// waits here rather than under Running now.
export function PausedItem({
  project,
  primary,
}: {
  readonly project: ProjectListing;
  readonly primary: boolean;
}): ReactElement {
  return (
    <WorkItem
      lead={<ProjectThumb projectId={project.id} />}
      status={<Status tone="waiting">Paused</Status>}
      title={projectLink(project)}
      detail="You paused it. Nothing runs until you continue it."
      action={
        <ButtonLink
          to="/projects/$projectId"
          params={{ projectId: project.id }}
          variant={primary ? "primary" : "secondary"}
        >
          Open to continue
        </ButtonLink>
      }
    />
  );
}
