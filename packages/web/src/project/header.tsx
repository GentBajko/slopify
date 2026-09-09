import type { ProjectSummary } from "@app/slices/admission/model.js";
import type { Prompt } from "@app/slices/library/model.js";
import { Lamp } from "@/components/lamp";
import { Rail } from "@/components/rail";
import { StateWord } from "@/components/state-word";
import { Button } from "@/components/ui/button";
import { startedAt } from "@/lib/utils";
import { ConfirmedButton } from "./controls.js";
import type { ProjectActions } from "./use-actions.js";

// The rundown's header: title, state, and controls for the run. Pause preserves work;
// Resume starts the saved configuration only after in-flight requests have stopped.
export function ProjectHeader({
  project,
  prompts,
  actions,
  inFlight,
  unsavedProviders,
}: {
  readonly project: ProjectSummary;
  // Undefined until the library has arrived: a prompt cannot be called deleted just
  // because the list naming it has not loaded yet.
  readonly prompts: readonly Prompt[] | undefined;
  readonly actions: ProjectActions;
  readonly inFlight: boolean;
  readonly unsavedProviders: boolean;
}) {
  const running = project.status === "running";
  return (
    <Rail className="flex-wrap py-3">
      <Lamp state={project.status} />
      <h1 className="text-row font-bold">{project.title}</h1>
      <span className="text-small text-ink2">{subtitle(project, prompts)}</span>
      <span className="ml-auto flex items-center gap-3">
        <StateWord state={project.status} announce="Project" />
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
      </span>
    </Rail>
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
