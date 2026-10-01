import type { ProjectListing } from "@app/slices/admission/model.js";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { useApp } from "@/app-context";
import { Button, ButtonRow } from "@/components/kit/button";
import { useCommand } from "@/components/kit/command-palette";
import { hitArea } from "@/components/kit/list-row";
import { useToast } from "@/components/kit/toast";
import { startedAt } from "@/lib/utils";
import { keys } from "@/queries";
import { PrepareUpload } from "@/studio/prepare-upload";
import { markUploaded } from "./api.js";
import { ProjectThumb } from "./project-thumb.js";

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

export function ReadyItem({ project }: { readonly project: ProjectListing }): ReactElement {
  const { api } = useApp();
  const client = useQueryClient();
  const notify = useToast();
  const mark = useMutation({
    mutationFn: (uploaded: boolean) => markUploaded(api, project.id, uploaded),
    onSuccess: (_, uploaded) => {
      notify(
        uploaded
          ? `Marked uploaded: ${project.title}. It is off Ready to upload; Projects still lists it.`
          : `${project.title} is back on Ready to upload.`,
        "success",
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
    <li className={`sl-home-ready ${hitArea}`}>
      <ProjectThumb projectId={project.id} />
      <div className="flex min-w-0 flex-col gap-2">
        <div className="sl-row__title">
          <Link to="/projects/$projectId" params={{ projectId: project.id }}>
            {project.title}
          </Link>
        </div>
        <div className="text-small text-ink-2">
          {`${project.format} · finished ${startedAt(project.updatedAt)}${project.status === "partial" ? " · a step failed" : ""}`}
        </div>
        <ButtonRow>
          <PrepareUpload projectId={project.id} ready size="small" />
          <Button
            variant="quiet"
            size="small"
            disabled={mark.isPending}
            disabledReason="Saving…"
            onClick={() => mark.mutate(true)}
          >
            Mark uploaded
          </Button>
        </ButtonRow>
      </div>
    </li>
  );
}
