import type { ProjectListing } from "@app/slices/admission/model.js";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { ReactElement, ReactNode } from "react";
import { useApp } from "@/app-context";
import { Button } from "@/components/kit/button";
import { useCommand } from "@/components/kit/command-palette";
import { Status } from "@/components/kit/status";
import { useToast } from "@/components/kit/toast";
import { startedAt } from "@/lib/utils";
import { keys } from "@/queries";
import { PrepareUpload } from "@/studio/prepare-upload";
import { markUploaded } from "./api.js";
import { ProjectThumb } from "./project-thumb.js";
import { WorkItem } from "./work-item.js";

// A finished video the person has not marked as uploaded yet. Slopify never uploads; Prepare
// upload lays out what Studio asks for, and Mark uploaded takes it off this list.
export function isReadyToUpload(project: ProjectListing): boolean {
  return (
    (project.status === "done" ||
      project.status === "partial" ||
      // Kept as is on Needs you: what is left was never going to run.
      (project.status === "pending" && project.setAside === true)) &&
    project.config.sources.video !== "off" &&
    project.uploadedAt === null
  );
}

export function ReadyItem({
  project,
  primary = false,
  check,
}: {
  readonly project: ProjectListing;
  readonly primary?: boolean;
  // The row's selection checkbox, when several are ready (work-list.tsx).
  readonly check?: ReactNode;
}): ReactElement {
  const { api } = useApp();
  const client = useQueryClient();
  const notify = useToast();
  const mark = useMutation({
    mutationFn: (uploaded: boolean) => markUploaded(api, project.id, uploaded),
    onSuccess: (_, uploaded) => {
      notify(
        uploaded
          ? `Marked uploaded: ${project.title}. It is off Needs you; Projects still lists it.`
          : `${project.title} is back on Needs you.`,
        "success",
        uploaded ? { label: "Undo", run: () => mark.mutate(false) } : undefined,
      );
    },
    onError: (error: Error) => {
      notify(
        `${project.title} wasn't marked uploaded: ${error.message} Press Mark uploaded again.`,
        "error",
      );
    },
    onSettled: async () => {
      await client.invalidateQueries({ queryKey: keys.projects });
    },
  });
  useCommand({
    id: `home.uploaded.${project.id}`,
    title: "Mark uploaded",
    group: "Ready to upload",
    context: project.title,
    keywords: ["youtube", "published", "done"],
    run: () => mark.mutate(true),
  });
  return (
    <WorkItem
      {...(check === undefined ? {} : { check })}
      lead={<ProjectThumb projectId={project.id} />}
      status={<Status tone="done">Ready to upload</Status>}
      title={
        <Link to="/projects/$projectId" params={{ projectId: project.id }}>
          {project.title}
        </Link>
      }
      detail={`${project.format} · finished ${startedAt(project.updatedAt)}${project.status === "partial" ? " · a step failed" : ""}`}
      action={
        <>
          <PrepareUpload projectId={project.id} ready variant={primary ? "primary" : "secondary"} />
          <Button
            variant="quiet"
            disabled={mark.isPending}
            disabledReason="Saving…"
            onClick={() => mark.mutate(true)}
          >
            Mark uploaded
          </Button>
        </>
      }
    />
  );
}
