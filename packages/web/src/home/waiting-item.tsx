import type { ProjectListing } from "@app/slices/admission/model.js";
import { heldWord } from "@app/slices/admission/state-words.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { type ReactElement, useRef } from "react";
import { useApp } from "@/app-context";
import { Button } from "@/components/kit/button";
import { useCommand } from "@/components/kit/command-palette";
import { ButtonLink } from "@/components/kit/link";
import { Status } from "@/components/kit/status";
import { useToast } from "@/components/kit/toast";
import {
  type ApprovalIdentity,
  approveCheckpoint,
  type CheckpointGate,
  checkpointKey,
  checkpointStatus,
} from "@/project/checkpoint-api";
import { keys } from "@/queries";
import { ProjectThumb } from "./project-thumb.js";
import { useKeepAsIs } from "./use-keep-as-is.js";
import { projectLink, WorkItem } from "./work-item.js";

// A run held for the person's review on Home's Needs you: approved here when the checkpoint
// holding it is still about the work as it stands, else opened to continue on its page.

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
  // The gate the run is stopped at: one the server says holds it for the person (`holding`,
  // reached and not a schedule's own hold), still about the work as it stands (an edit since
  // would need the project page's review).
  const theirs = new Set(
    (project.holding ?? [])
      .filter((hold) => hold.waitsFor === "person")
      .map((hold) => hold.checkpointId),
  );
  const gate = status.data?.checkpoints.find(
    (one) => theirs.has(one.checkpointId) && one.fingerprint === one.currentFingerprint,
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
          : status.error !== null
            ? `Its review didn't load: ${status.error.message} Open the project to review it there.`
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
