import type { StageKind } from "@app/kernel/pipeline.js";
import type { ProjectListing } from "@app/slices/admission/model.js";
import { shortReason } from "@app/slices/notifications/rules.js";
import type { ScheduleSummary } from "@app/slices/schedules/model.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { LayersIcon } from "lucide-react";
import { type ReactElement, type ReactNode, useRef } from "react";
import { readProject } from "@/api";
import { useApp } from "@/app-context";
import { Button, ButtonRow } from "@/components/kit/button";
import { useCommand } from "@/components/kit/command-palette";
import { ButtonLink } from "@/components/kit/link";
import { hitArea, hitTarget } from "@/components/kit/list-row";
import { Status } from "@/components/kit/status";
import { useToast } from "@/components/kit/toast";
import { copyText } from "@/fixes/fix-actions";
import { cn } from "@/lib/utils";
import {
  type ApprovalIdentity,
  approveCheckpoint,
  type CheckpointGate,
  checkpointKey,
  checkpointStatus,
} from "@/project/checkpoint-api";
import { fixOf } from "@/project/fix-it";
import { stageNames } from "@/project/summary";
import { keys } from "@/queries";
import { ProjectThumb } from "./project-thumb.js";

// Home's "Needs you": runs holding for a review, schedules holding suggested topics, and runs
// that failed with the one thing that fixes them. Only the first item's action is primary;
// the accent is spent once in the area.

export function needsYouCount(
  waiting: readonly ProjectListing[],
  failed: readonly ProjectListing[],
  held: readonly ScheduleSummary[],
): number {
  return waiting.length + failed.length + held.length;
}

// A run the runner stopped for the person: it ran, and now nothing may start (a checkpoint
// holds the next step, or held work waits for Continue). The same reading the "Waiting for
// you" notification uses.
export function isWaiting(project: ProjectListing): boolean {
  return project.status === "pending" && project.progress > 0;
}

function Item({
  lead,
  status,
  title,
  detail,
  action,
}: {
  readonly lead: ReactNode;
  readonly status: ReactNode;
  readonly title: ReactNode;
  readonly detail: ReactNode;
  readonly action: ReactNode;
}): ReactElement {
  return (
    <li className={cn("sl-home-item", hitArea)}>
      {lead}
      <div className="flex min-w-0 flex-col gap-1">
        {status}
        <div className="sl-row__title text-[17px]">{title}</div>
        <div className="text-small text-ink-2">{detail}</div>
      </div>
      <ButtonRow className="sl-home-item__action">{action}</ButtonRow>
    </li>
  );
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
  audio: "review before the narration",
  images: "review before the images",
  video: "review before the video",
};

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
  // The gate the run is stopped at: reached, not yet approved, and still about the work as it
  // stands (an edit since would need the project page's review).
  const gate = status.data?.checkpoints.find(
    (one) =>
      (one.state === "held" || one.state === "pending-review") &&
      one.fingerprint === one.currentFingerprint,
  );
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
    <Item
      lead={<ProjectThumb projectId={project.id} />}
      status={
        <Status tone="waiting">
          {gate === undefined ? "Waiting for you" : `Waiting for you · ${heldWords[gate.stage]}`}
        </Status>
      }
      title={projectLink(project)}
      detail={
        gate === undefined
          ? "Its next step is held. Open the project to review it and continue the run."
          : "Everything before this step is done. Approve to let the run go on, or open the project to look first."
      }
      action={
        gate === undefined || label === undefined ? (
          <ButtonLink
            to="/projects/$projectId"
            params={{ projectId: project.id }}
            variant={primary ? "primary" : "secondary"}
          >
            Open to continue
          </ButtonLink>
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
    <Item
      lead={
        <div className="sl-media__frame flex items-center justify-center bg-sunken text-info">
          <LayersIcon aria-hidden="true" strokeWidth={1.75} className="size-7" />
        </div>
      }
      status={
        <Status tone="info">{`${String(count)} new ${count === 1 ? "topic" : "topics"}`}</Status>
      }
      title={schedule.name}
      detail={`Slopify suggested ${count === 1 ? "a topic" : `${String(count)} topics`} for this schedule. Queue the ones you want and reject the rest.`}
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
    <Item
      lead={<ProjectThumb projectId={project.id} />}
      status={<Status tone="waiting">Paused</Status>}
      title={projectLink(project)}
      detail="You paused this run. Nothing more happens until you open it and press Continue the run."
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
  const reason = shortReason(stage?.failureReason) ?? "The run stopped with an error.";
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
    <Item
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
