import type { StageKind } from "@app/kernel/pipeline.js";
import type { ProjectListing } from "@app/slices/admission/model.js";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { readProject } from "@/api";
import { useApp } from "@/app-context";
import { Button } from "@/components/kit/button";
import { ButtonLink } from "@/components/kit/link";
import { Status } from "@/components/kit/status";
import { useToast } from "@/components/kit/toast";
import { copyText } from "@/fixes/fix-actions";
import { stageWords } from "@/lib/stage-words";
import { fixOf } from "@/project/fix-it";
import { keys } from "@/queries";
import { ProjectThumb } from "./project-thumb.js";
import { projectLink, WorkItem } from "./work-item.js";

// "Image 1: The chosen model is not …": a step's error names the item it failed on before its
// sentence (`rebuild/runtime-piece-label.ts`). Home has room for the sentence whole, and its fix
// is usually at the end, so it is never cut; the item ("Image 1") goes beside the state word,
// where the step's name stands, when it is one of the step's own items.
export function failureLine(
  reason: string | null | undefined,
  stageWord: string,
): { readonly item?: string; readonly text: string } | undefined {
  const line = reason
    ?.split(/\r?\n/)
    .map((part) => part.trim())
    .find((part) => part !== "");
  if (line === undefined) return undefined;
  const at = line.indexOf(": ");
  const item = at === -1 ? "" : line.slice(0, at);
  // "Images" names "Image 1", "Thumbnail" "Thumbnail 2", "Narration" "Narration chunk 3 of 8".
  const stem = stageWord.toLowerCase().replace(/s$/, "");
  const own = item.length > 0 && item.length <= 48 && item.toLowerCase().startsWith(stem);
  const text = own ? line.slice(at + 2) : line;
  return own && text !== "" ? { item, text } : { text: line };
}

// A failed run on Home's Needs you, with the one thing that fixes it.
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
  const stageWord = stage === undefined ? undefined : stageWords[stage.kind as StageKind];
  const failure =
    stageWord === undefined ? undefined : failureLine(stage?.failureReason, stageWord);
  const reason =
    failure?.text ??
    (body.error === null
      ? "The run stopped with an error."
      : `The run stopped with an error; its details didn't load (${body.error.message}). Open the project to see them.`);
  const where: string = stageWord === undefined ? "" : ` · ${failure?.item ?? stageWord}`;
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
