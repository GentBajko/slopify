import type { ProjectSummary } from "@app/slices/admission/model.js";
import type { Prompt } from "@app/slices/library/model.js";
import type { Output } from "@app/slices/storage/model.js";
import { EllipsisIcon } from "lucide-react";
import { type ReactNode, useState } from "react";
import { ConfirmDialog } from "@/components/confirm";
import { PageBar } from "@/components/kit/page-bar";
import { Lamp } from "@/components/lamp";
import { StateWord } from "@/components/state-word";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { startedAt } from "@/lib/utils";
import { confirmationFor } from "./confirmations.js";
import { OutputDownload } from "./parts.js";
import type { ProjectActions } from "./use-actions.js";

export function ProjectHeader({
  project,
  prompts,
  actions,
  inFlight,
  resumable,
  primaryOutput,
  children,
}: {
  readonly project: ProjectSummary;
  // Undefined until the library has arrived: a prompt cannot be called deleted just
  // because the list naming it has not loaded yet.
  readonly prompts: readonly Prompt[] | undefined;
  readonly actions: ProjectActions;
  readonly inFlight: boolean;
  // A pending revision can hold work nothing will start; only Resume admits it.
  readonly resumable: boolean;
  readonly primaryOutput: Output | undefined;
  readonly children?: ReactNode;
}) {
  const running = project.status === "running";
  const [cancelling, setCancelling] = useState(false);
  // One toggle, always mounted: it reads Pause while there is work to hold and Resume when
  // there is work to continue, and is disabled when neither applies.
  const canPause = running || (project.status === "pending" && !resumable);
  const canResume =
    resumable ||
    project.status === "paused" ||
    project.status === "failed" ||
    project.status === "canceled";
  const cancelCopy = confirmationFor({ kind: "cancel" });
  return (
    <PageBar
      back={{ to: "/", label: "Projects" }}
      lead={<Lamp state={project.status} />}
      title={project.title}
      status={<StateWord state={project.status} announce="Project" />}
      meta={subtitle(project, prompts)}
      actions={
        <>
          {children}
          {canPause ? (
            <Button disabled={actions.pending} onClick={() => actions.run({ kind: "pause" })}>
              Pause
            </Button>
          ) : (
            <Button
              disabled={!canResume || actions.pending || inFlight}
              onClick={() => actions.run({ kind: "resume" })}
            >
              {actions.performing?.kind === "resume" ? "Resuming…" : "Resume"}
            </Button>
          )}
          {primaryOutput ? (
            <span className="inline-flex h-8 items-center rounded-control border border-accent bg-accent px-3 [&_a]:font-semibold [&_a]:text-accent-ink [&_button]:text-accent-ink">
              <OutputDownload
                output={primaryOutput}
                label={
                  primaryOutput.role === "video"
                    ? "Download video"
                    : primaryOutput.role === "audio_export"
                      ? "Download audio"
                      : "Download article"
                }
              />
            </span>
          ) : (
            <Button disabled title="Available once the final output has been made">
              Download
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" aria-label="More project actions" className="size-8 p-0">
                <EllipsisIcon aria-hidden="true" className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem
                disabled={!running || actions.pending}
                onSelect={() => setCancelling(true)}
              >
                Cancel run
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <ConfirmDialog
            open={cancelling}
            title={cancelCopy.title}
            consequence={cancelCopy.consequence}
            verb={cancelCopy.verb}
            dismiss={cancelCopy.dismiss}
            pending={actions.pending}
            onConfirm={() => {
              setCancelling(false);
              actions.run({ kind: "cancel" });
            }}
            onCancel={() => setCancelling(false)}
          />
        </>
      }
    />
  );
}

// "Documentary dossier · 9:16 · started 21:14". The name is the run's own copy of it, so a
// template deleted since the run is still named, marked as gone.
function subtitle(project: ProjectSummary, prompts: readonly Prompt[] | undefined): string {
  const name = project.config.articlePrompt;
  const known = prompts === undefined || prompts.some((prompt) => prompt.name === name);
  const shown = name === undefined || name === "" ? undefined : known ? name : `${name} (deleted)`;
  return [shown, project.format, `started ${startedAt(project.createdAt)}`]
    .filter((part) => part !== undefined)
    .join(" · ");
}
