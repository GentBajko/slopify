import type { StageKind } from "@app/kernel/pipeline.js";
import type { ProjectListing } from "@app/slices/admission/model.js";
import { heldWord, stoppedWord } from "@app/slices/admission/state-words.js";
import { shortReason } from "@app/slices/notifications/rules.js";
import type { ScheduleSummary } from "@app/slices/schedules/model.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { LayersIcon } from "lucide-react";
import { type ReactElement, useRef } from "react";
import { readProject } from "@/api";
import { useApp } from "@/app-context";
import { Button } from "@/components/kit/button";
import { useCommand } from "@/components/kit/command-palette";
import { ButtonLink } from "@/components/kit/link";
import { hitTarget } from "@/components/kit/list-row";
import { Status } from "@/components/kit/status";
import { useToast } from "@/components/kit/toast";
import { copyText } from "@/fixes/fix-actions";
import {
  type ApprovalIdentity,
  approveCheckpoint,
  type CheckpointGate,
  checkpointKey,
  checkpointStatus,
} from "@/project/checkpoint-api";
import { fixOf } from "@/project/fix-it";
import { stageNames } from "@/project/summary";
import { useProjectActions } from "@/project/use-actions";
import { keys } from "@/queries";
import { setAside } from "./api.js";
import { ProjectThumb } from "./project-thumb.js";
import { WorkItem } from "./work-item.js";

// Home's "Needs you": runs holding for a review or stopped before they finished, schedules
// holding suggested topics, and runs that failed with the one thing that fixes them. Only the first item's action is primary;
// the accent is spent once in the area.

export function needsYouCount(
  waiting: readonly ProjectListing[],
  failed: readonly ProjectListing[],
  held: readonly ScheduleSummary[],
): number {
  return waiting.length + failed.length + held.length;
}

function projectLink(project: { readonly id: string; readonly title: string }): ReactElement {
  return (
    <Link to="/projects/$projectId" params={{ projectId: project.id }}>
      {project.title}
    </Link>
  );
}

const approveWords: Readonly<Record<CheckpointGate["stage"], string>> = {
  audio: "Approve the article and record",
  images: "Approve and draw the images",
  video: "Approve and render",
};

const heldWords: Readonly<Record<CheckpointGate["stage"], string>> = {
  audio: "before the narration",
  images: "before the images",
  video: "before the video",
};

// "Keep as is": held work the person does not want run (a step added after the project was
// made, whose run would redraw what is finished) leaves Needs you until the next edit.
function useKeepAsIs(project: ProjectListing) {
  const { api } = useApp();
  const client = useQueryClient();
  const notify = useToast();
  const keep = useMutation({
    mutationFn: (aside: boolean) => setAside(api, project.id, aside),
    onSuccess: (_, aside) => {
      notify(
        aside
          ? `Kept as is: ${project.title}. It is off Needs you; editing the project brings it back.`
          : `${project.title} is back on Needs you.`,
        "success",
        aside ? { label: "Undo", run: () => keep.mutate(false) } : undefined,
      );
    },
    onError: (error: Error) => {
      notify(
        `${project.title} wasn't kept as is: ${error.message} Press Keep as is again.`,
        "error",
      );
    },
    onSettled: () => client.invalidateQueries({ queryKey: keys.projects }),
  });
  return keep;
}

export function WaitingItem({
  project,
  primary,
}: {
  readonly project: ProjectListing;
  readonly primary: boolean;
}): ReactElement {
  const { api } = useApp();
  const client = useQueryClient();
  const notify = useToast();
  const navigate = useNavigate();
  const identity = useRef<ApprovalIdentity | null>(null);
  const status = useQuery({
    queryKey: checkpointKey(project.id),
    queryFn: async () => {
      const reply = await checkpointStatus(api, project.id);
      if (!reply.ok) throw new Error(reply.message);
      return reply.value;
    },
  });
  const body = useQuery({
    queryKey: keys.project(project.id),
    queryFn: () => readProject(api, project.id),
  });
  // The gate the run is stopped at: one the server says holds it for the person (`holding`,
  // reached and not a schedule's own hold), still about the work as it stands (an edit since
  // would need the project page's review).
  const theirs = new Set(
    (body.data?.holding ?? [])
      .filter((hold) => hold.waitsFor === "person")
      .map((hold) => hold.checkpointId),
  );
  const gate = status.data?.checkpoints.find(
    (one) => theirs.has(one.checkpointId) && one.fingerprint === one.currentFingerprint,
  );
  const unread = status.error ?? body.error;
  const approve = useMutation({
    mutationFn: async (held: CheckpointGate) => {
      identity.current ??= {
        revisionId: held.revisionId,
        fingerprint: held.fingerprint,
        idempotencyKey: crypto.randomUUID(),
      };
      const reply = await approveCheckpoint(api, project.id, held.checkpointId, identity.current);
      identity.current = null;
      return reply;
    },
    onSuccess: (reply) => {
      notify(
        reply.ok
          ? `Approved: ${project.title}. The run continues.`
          : `${project.title} wasn't approved: ${reply.message} Open the project to review it there.`,
        reply.ok ? "success" : "error",
      );
    },
    onError: (error: Error) => {
      notify(
        `Slopify didn't confirm the approval of ${project.title}: ${error.message} Press the button again to check whether it went through.`,
        "error",
      );
    },
    onSettled: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: checkpointKey(project.id) }),
        client.invalidateQueries({ queryKey: keys.projects }),
      ]);
    },
  });
  const keep = useKeepAsIs(project);
  const label = gate === undefined ? undefined : approveWords[gate.stage];
  useCommand({
    id: `home.approve.${project.id}`,
    title: label ?? "Open the held run",
    group: "Needs you",
    context: project.title,
    keywords: ["approve", "review", "waiting"],
    run: () => {
      if (gate !== undefined) approve.mutate(gate);
      else void navigate({ to: "/projects/$projectId", params: { projectId: project.id } });
    },
  });
  return (
    <WorkItem
      lead={<ProjectThumb projectId={project.id} />}
      status={
        <Status tone="waiting">
          {gate === undefined ? heldWord : `${heldWord} · ${heldWords[gate.stage]}`}
        </Status>
      }
      title={projectLink(project)}
      detail={
        gate !== undefined
          ? undefined
          : unread !== null
            ? `Its review didn't load: ${unread.message} Open the project to review it there.`
            : "Its next step is held for your review."
      }
      action={
        gate === undefined || label === undefined ? (
          <>
            <ButtonLink
              to="/projects/$projectId"
              params={{ projectId: project.id }}
              variant={primary ? "primary" : "secondary"}
            >
              Open to continue
            </ButtonLink>
            <Button
              variant="quiet"
              disabled={keep.isPending}
              disabledReason="Saving…"
              onClick={() => keep.mutate(true)}
            >
              Keep as is
            </Button>
          </>
        ) : (
          <Button
            variant={primary ? "primary" : "secondary"}
            disabled={approve.isPending}
            disabledReason="Approving…"
            onClick={() => approve.mutate(gate)}
          >
            {approve.isPending ? "Approving…" : label}
          </Button>
        )
      }
    />
  );
}

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
          ? "The run stopped before it finished. Continuing makes only what is missing; everything made so far is kept."
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

export function FailedItem({
  project,
  primary,
}: {
  readonly project: ProjectListing;
  readonly primary: boolean;
}): ReactElement {
  const { api } = useApp();
  const body = useQuery({
    queryKey: keys.project(project.id),
    queryFn: () => readProject(api, project.id),
  });
  const stage = body.data?.stages.find((one) => one.state === "failed");
  const notify = useToast();
  const copySignIn = async (command: string) => {
    const copied = await copyText(command);
    notify(
      copied
        ? `Copied ${command}. Run it in a terminal on the computer running Slopify and sign in, then open the project and press Check again.`
        : `Couldn't copy: the browser blocked the clipboard. Type ${command} in a terminal, sign in, then open the project and press Check again.`,
      copied ? "success" : "error",
    );
  };
  const fix =
    stage === undefined || body.data === undefined ? undefined : fixOf(stage, body.data.project);
  const reason =
    shortReason(stage?.failureReason) ??
    (body.error === null
      ? "The run stopped with an error."
      : `The run stopped with an error; its details didn't load (${body.error.message}). Open the project to see them.`);
  const where: string = stage === undefined ? "" : ` · ${stageNames[stage.kind as StageKind]}`;
  const variant = primary ? "primary" : "secondary";
  const action =
    fix?.kind === "provider-settings" ? (
      <ButtonLink to="/settings" search={{ section: "providers" }} variant={variant}>
        {fix.label}
      </ButtonLink>
    ) : fix?.kind === "free-space" ? (
      <ButtonLink to="/settings" search={{ section: "storage" }} variant={variant}>
        {fix.label}
      </ButtonLink>
    ) : fix?.kind === "sign-in" ? (
      // The command to copy here; Check again on the project retries the step once signed in.
      <>
        <Button variant={variant} onClick={() => void copySignIn(fix.command)}>
          Copy sign-in command
        </Button>
        <ButtonLink to="/projects/$projectId" params={{ projectId: project.id }}>
          Open to retry
        </ButtonLink>
      </>
    ) : (
      <ButtonLink to="/projects/$projectId" params={{ projectId: project.id }} variant={variant}>
        {fix?.label ?? "Open to retry"}
      </ButtonLink>
    );
  return (
    <WorkItem
      lead={<ProjectThumb projectId={project.id} />}
      status={<Status tone="failed">{`Failed${where}`}</Status>}
      title={projectLink(project)}
      detail={
        fix?.kind === "sign-in" ? (
          <>
            {reason} Run <code className="sl-code">{fix.command}</code> in a terminal to sign in,
            then press Check again on the project to retry the step.
          </>
        ) : (
          reason
        )
      }
      action={action}
    />
  );
}
