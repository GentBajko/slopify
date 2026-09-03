import type { StageState } from "@app/kernel/pipeline.js";
import type { ProjectSummary } from "@app/slices/admission/model.js";
import type { Prompt } from "@app/slices/library/model.js";
import { Lamp } from "@/components/lamp";
import { Rail } from "@/components/rail";
import { StateWord } from "@/components/state-word";
import { startedAt } from "@/lib/utils";
import { ConfirmedButton } from "./controls.js";
import type { ProjectActions } from "./use-actions.js";

// The rundown's header: lamp, title, what the run was made of, its state word, and Cancel
// while it is running (uiux/screens/08-project.md, Composition). `logic/13` §Q108 shows
// Cancel only while the project reads `running`, and a second press is the server's no-op.
export function ProjectHeader({
  project,
  prompts,
  actions,
}: {
  readonly project: ProjectSummary;
  // Undefined until the library has arrived: a prompt cannot be called deleted just
  // because the list naming it has not loaded yet.
  readonly prompts: readonly Prompt[] | undefined;
  readonly actions: ProjectActions;
}) {
  const running = project.status === "running";
  return (
    <Rail className="py-3">
      <Lamp state={lampOf(project)} />
      <h1 className="text-row font-bold">{project.title}</h1>
      <span className="text-small text-ink2">{subtitle(project, prompts)}</span>
      <span className="ml-auto flex items-center gap-3">
        <StateWord state={lampOf(project)} announce="Project" />
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

// Every project state is also a stage state, so the lamp and the word take it unchanged.
// The derived `pending` is the window between creating a project and the runner claiming
// its first stage (`kernel/pipeline.ts`), and it reads as an unlit lamp.
function lampOf(project: ProjectSummary): StageState {
  return project.status;
}

// "Documentary dossier · 9:16 · started 21:14". The name is the run's own copy of it, so a
// template deleted since the run is still named, marked as gone (`logic/15` §Q123).
function subtitle(project: ProjectSummary, prompts: readonly Prompt[] | undefined): string {
  const name = project.config.articlePrompt;
  const known = prompts === undefined || prompts.some((prompt) => prompt.name === name);
  const shown = name === undefined || name === "" ? undefined : known ? name : `${name} (deleted)`;
  return [shown, project.format, `started ${startedAt(project.createdAt)}`]
    .filter((part) => part !== undefined)
    .join(" · ");
}
