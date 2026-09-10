import type { ProjectSummary } from "@app/slices/admission/model.js";
import type { Prompt } from "@app/slices/library/model.js";
import type { Output } from "@app/slices/storage/model.js";
import { Settings2 } from "lucide-react";
import { Lamp } from "@/components/lamp";
import { StateWord } from "@/components/state-word";
import { Button } from "@/components/ui/button";
import { startedAt } from "@/lib/utils";
import { ConfirmedButton } from "./controls.js";
import { OutputDownload } from "./parts.js";
import type { ProjectActions } from "./use-actions.js";

// The rundown's header: title, state, and controls for the run. Pause preserves work;
// Resume starts the saved configuration only after in-flight requests have stopped.
export function ProjectHeader({
  project,
  prompts,
  actions,
  inFlight,
  unsavedProviders,
  settingsOpen,
  onToggleSettings,
  primaryOutput,
}: {
  readonly project: ProjectSummary;
  // Undefined until the library has arrived: a prompt cannot be called deleted just
  // because the list naming it has not loaded yet.
  readonly prompts: readonly Prompt[] | undefined;
  readonly actions: ProjectActions;
  readonly inFlight: boolean;
  readonly unsavedProviders: boolean;
  readonly settingsOpen: boolean;
  readonly onToggleSettings: () => void;
  readonly primaryOutput: Output | undefined;
}) {
  const running = project.status === "running";
  return (
    <div className="flex flex-wrap items-start justify-between gap-5 py-2">
      <div className="w-full min-w-0 sm:min-w-[220px] sm:flex-1">
        <div className="mb-2 flex items-center gap-2">
          <Lamp state={project.status} />
          <StateWord state={project.status} announce="Project" />
        </div>
        <h1 className="break-words text-[28px] font-bold leading-tight">{project.title}</h1>
        <p className="mt-2 text-small text-ink2">{subtitle(project, prompts)}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {primaryOutput ? (
          <span className="rounded-control border border-accent bg-accent px-4 py-2 [&_a]:font-semibold [&_a]:text-accent-ink">
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
        ) : null}
        <Button aria-expanded={settingsOpen} onClick={onToggleSettings}>
          <Settings2 aria-hidden="true" className="mr-2 size-4" />
          Run settings{unsavedProviders ? " •" : ""}
        </Button>
        {running || project.status === "pending" ? (
          <Button disabled={actions.pending} onClick={() => actions.run({ kind: "pause" })}>
            Pause
          </Button>
        ) : null}
        {project.status === "paused" || project.status === "failed" ? (
          <Button
            disabled={actions.pending || inFlight || unsavedProviders}
            onClick={() => actions.run({ kind: "resume" })}
          >
            Resume
          </Button>
        ) : null}
        {running ? (
          <ConfirmedButton
            action={{ kind: "cancel" }}
            run={() => {
              actions.run({ kind: "cancel" });
            }}
            pending={actions.pending}
          >
            Cancel run
          </ConfirmedButton>
        ) : null}
      </div>
      {unsavedProviders ? (
        <p className="w-full rounded-control border border-line2 bg-panel2 px-3 py-2 text-small text-ink2">
          You have unsaved changes. Save or discard them before resuming.
        </p>
      ) : null}
    </div>
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
