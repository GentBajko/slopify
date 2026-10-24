import type { ProjectListing } from "@app/slices/admission/model.js";
import type { ReactElement } from "react";
import { fileUrl } from "@/api";
import { useApp } from "@/app-context";
import { ButtonLink, FileLink, TextLink } from "@/components/kit/link";
import { Status } from "@/components/kit/status";
import { projectStateOf, type StateLook } from "@/lib/state-words";
import { limitWaitLine } from "@/project/limit-wait";
import { sectionForStage } from "@/project/next-action";
import { failedWords, finishedLine } from "./finished-words.js";
import { ProjectThumb } from "./project-thumb.js";
import { projectLink, WorkItem } from "./work-item.js";

// Finished work of the person's own: a run that is done, done with problems, or Kept as is
// (what is left was never going to run). Home's Finished lists these, uploaded or not. The
// bundled samples are not the person's work and are listed apart.
export function finishedWork(project: ProjectListing): boolean {
  return (
    project.sample !== true &&
    (project.status === "done" ||
      project.status === "partial" ||
      (project.status === "pending" && project.setAside === true))
  );
}

// A finished video the person has not marked as uploaded yet. Slopify never uploads; Mark
// uploaded (on Projects and in Copy for YouTube Studio) makes it Uploaded. The bundled samples
// are never uploaded, so they are never ready to upload: Home, the Projects counts and filters
// and the selection bar agree on that.
export function isReadyToUpload(project: ProjectListing): boolean {
  return (
    finishedWork(project) && project.config.sources.video !== "off" && project.uploadedAt === null
  );
}

// One word per state on every list (Home, Projects): a run waiting for a CLI plan says so, a
// finished video reads Ready to upload until it is marked Uploaded, a run that made its video
// but lost a step reads Done with problems, and the rest read as the project page says them.
export function listState(project: ProjectListing): StateLook {
  // Running, but a step waits for a CLI plan to reset: "Waiting for Codex limits (resets at 14:00)".
  const limits = project.status === "running" ? limitWaitLine(project.limitWaits) : undefined;
  if (limits !== undefined) return { tone: "waiting", word: limits };
  if (project.status === "done" && project.uploadedAt !== null)
    return { tone: "done", word: "Uploaded" };
  if (project.status === "done" && isReadyToUpload(project))
    return { tone: "done", word: "Ready to upload" };
  return projectStateOf(project);
}

// "PDF failed · See what failed": a run that made its video names the step it lost and links
// to it on the project page.
export function FailedStep({ project }: { readonly project: ProjectListing }): ReactElement | null {
  const first = project.failedSteps?.[0];
  if (project.status !== "partial" || first === undefined) return null;
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-2">
      <span className="text-waiting">{failedWords(project.failedSteps ?? [])}</span>
      <TextLink
        to="/projects/$projectId"
        params={{ projectId: project.id }}
        search={{ section: sectionForStage(first) }}
      >
        See what failed
      </TextLink>
    </span>
  );
}

// A finished project on Home: its picture, its state, what it is, and what a person does with
// it. A video is watched (its project's Video section) and downloaded; anything else (an
// audiobook, a podcast) is opened. A sample says Done like any finished run: the section it
// sits in is named Finished samples.
export function FinishedItem({
  project,
  primary = false,
}: {
  readonly project: ProjectListing;
  readonly primary?: boolean;
}): ReactElement {
  const { api } = useApp();
  const state = listState(project);
  const video = project.config.sources.video !== "off";
  return (
    <WorkItem
      lead={<ProjectThumb projectId={project.id} />}
      status={<Status tone={state.tone}>{state.word}</Status>}
      title={projectLink(project)}
      detail={
        <>
          {finishedLine(project)}
          {project.status === "partial" ? (
            <>
              {" · "}
              <FailedStep project={project} />
            </>
          ) : null}
        </>
      }
      action={
        <>
          <ButtonLink
            to="/projects/$projectId"
            params={{ projectId: project.id }}
            {...(video ? { search: { section: "video" } } : {})}
            variant={primary ? "primary" : "secondary"}
            aria-label={`${video ? "Watch" : "Open"} ${project.title}`}
          >
            {video ? "Watch" : "Open"}
          </ButtonLink>
          {project.sample === true || project.outputs?.video !== true ? null : (
            <FileLink
              href={fileUrl(api, project.id, "video")}
              download
              variant="secondary"
              aria-label={`Download video: ${project.title}`}
            >
              Download video
            </FileLink>
          )}
        </>
      }
    />
  );
}
