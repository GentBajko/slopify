import type { RunConfig } from "@app/slices/admission/model.js";
import type { CostEstimate } from "@app/slices/estimate/index.js";
import {
  type AddableOutput,
  addableOutputLabels,
  addableOutputs,
  planAddedOutput,
} from "@app/slices/outputs/add.js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactElement, useRef, useState } from "react";
import { useApp } from "@/app-context";
import { StatusSlot } from "@/components/kit/action-bar";
import { Button } from "@/components/kit/button";
import { Dialog } from "@/components/kit/dialog";
import { Fact, Facts } from "@/components/kit/facts";
import { keys } from "@/queries";
import { type AddedOutputPreview, addProjectOutput, previewAddedOutput } from "./output-api.js";
import type { EditSection, RevisionController } from "./revision-controller.js";
import { money } from "./stage-price.js";

// Add another output: the same project's brief, sources and accepted text made into one more
// kind of result. The dialog says what is reused as it is, what is made, how the text is used
// and the estimated extra cost before anything is saved; Add saves a new version of the
// project with the output switched on and starts only the work it needs.
export function AddOutputDialog({
  projectId,
  revisionId,
  config,
  controller,
  onClose,
}: {
  readonly projectId: string;
  readonly revisionId: string;
  readonly config: RunConfig;
  readonly controller: Pick<RevisionController, "review" | "requestEdit">;
  readonly onClose: () => void;
}): ReactElement {
  const { api } = useApp();
  const client = useQueryClient();
  const choices = addableOutputs.flatMap((kind) => {
    const plan = planAddedOutput(config, kind);
    if (!plan.ok && plan.reason === "already") return [];
    return [{ kind, refusal: plan.ok ? undefined : plan.message }];
  });
  const [kind, setKind] = useState<AddableOutput | undefined>(
    choices.find((one) => one.refusal === undefined)?.kind,
  );
  const [adding, setAdding] = useState(false);
  // An adaptation rewrites the text: Add stays off until the person says that is what they want.
  const [adapt, setAdapt] = useState(false);
  const [problem, setProblem] = useState<string | undefined>();
  const key = useRef<{ readonly kind: AddableOutput; readonly id: string } | undefined>(undefined);
  const refusal = choices.find((one) => one.kind === kind)?.refusal;
  const preview = useQuery({
    queryKey: ["project", projectId, "add-output", revisionId, kind ?? ""],
    enabled: kind !== undefined && refusal === undefined,
    staleTime: 0,
    queryFn: async (): Promise<AddedOutputPreview> => {
      if (kind === undefined) throw new Error("Choose an output to add.");
      const result = await previewAddedOutput(api, projectId, { baseRevisionId: revisionId, kind });
      if (!result.ok) throw new Error(result.message);
      return result.value;
    },
  });
  const shown = preview.data;
  const blocked = shown !== undefined && shown.problems.length > 0;
  const add = async (): Promise<void> => {
    if (kind === undefined || shown === undefined) return;
    setAdding(true);
    setProblem(undefined);
    try {
      // The same key for a retry of the same choice, so a repeated press saves once.
      if (key.current?.kind !== kind) key.current = { kind, id: crypto.randomUUID() };
      const result = await addProjectOutput(api, projectId, {
        baseRevisionId: revisionId,
        kind,
        idempotencyKey: key.current.id,
        ...(shown.adapts ? { adapt } : {}),
      });
      if (!result.ok) {
        setProblem(result.message);
        return;
      }
      await client.invalidateQueries({ queryKey: keys.project(projectId) });
      onClose();
      if (result.value.workKeys.length > 0)
        controller.review(
          { kind: "selected", workKeys: result.value.workKeys },
          {
            autoStart: true,
            approvedUpTo: shown.estimate.unknown === 0 ? shown.estimate.high : undefined,
          },
        );
    } catch (failure) {
      setProblem(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setAdding(false);
    }
  };
  const label = kind === undefined ? "output" : addableOutputLabels[kind].replace(/ \(.*\)$/, "");
  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next && !adding) onClose();
      }}
      title="Add another output"
      description="Made from this project's brief, sources and accepted text. What it already has stays as it is."
      footer={
        <>
          <StatusSlot tone={problem === undefined ? "info" : "error"}>
            {problem ?? (preview.error === null ? undefined : preview.error.message)}
          </StatusSlot>
          <Button variant="secondary" disabled={adding} onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={
              adding ||
              shown === undefined ||
              blocked ||
              refusal !== undefined ||
              kind === undefined ||
              (shown.adapts && !adapt)
            }
            disabledReason={
              adding
                ? "Adding it"
                : blocked
                  ? "Set the missing choices in Settings first"
                  : shown?.adapts === true && !adapt
                    ? "Tick Adapt my article into a conversation first"
                    : "Choose an output it can add"
            }
            onClick={() => void add()}
          >
            {`Add ${label.toLowerCase()}`}
          </Button>
        </>
      }
    >
      <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
        <legend className="sl-kicker mb-1">Output</legend>
        {choices.map((choice) => (
          <label key={choice.kind} className="flex items-start gap-2 text-small">
            <input
              type="radio"
              name="added-output"
              className="mt-1"
              checked={kind === choice.kind}
              onChange={() => {
                setKind(choice.kind);
                setAdapt(false);
                setProblem(undefined);
              }}
            />
            <span className="min-w-0">
              <span className="text-ink">{addableOutputLabels[choice.kind]}</span>
              {choice.refusal === undefined || kind !== choice.kind ? null : (
                <span className="block text-ink-2">{choice.refusal}</span>
              )}
            </span>
          </label>
        ))}
      </fieldset>
      {shown === undefined || refusal !== undefined ? (
        preview.isFetching ? (
          <p className="m-0 text-small text-ink-2">Working out what it needs…</p>
        ) : null
      ) : (
        <Facts label={`What adding ${label.toLowerCase()} does`}>
          <Fact label="Reused as it is">{shown.reused.join(", ")}</Fact>
          <Fact label="Made new">{shown.created.join(", ")}</Fact>
          <Fact label="Your text">{shown.textUse}</Fact>
          <Fact label="Estimated extra cost">{costWords(shown.estimate)}</Fact>
        </Facts>
      )}
      {shown?.adapts === true && refusal === undefined ? (
        <label className="flex items-start gap-2 text-small">
          <input
            type="checkbox"
            className="mt-1"
            checked={adapt}
            onChange={(event) => setAdapt(event.target.checked)}
          />
          <span>Adapt my article into a conversation (the article itself stays as it is)</span>
        </label>
      ) : null}
      {shown !== undefined && blocked ? (
        <div className="flex flex-col gap-2">
          <ul className="m-0 flex flex-col gap-1 pl-5 text-small text-danger">
            {shown.problems.map((one) => (
              <li key={one.field}>{one.message}</li>
            ))}
          </ul>
          <Button
            variant="secondary"
            className="self-start"
            onClick={() => {
              const next = shown.config;
              onClose();
              controller.requestEdit({
                section: sectionFor(shown.problems[0]?.field ?? ""),
                change: (edit) => ({ ...edit, config: next }),
              });
            }}
          >
            {`Open Settings with ${label.toLowerCase()} switched on`}
          </Button>
        </div>
      ) : null}
    </Dialog>
  );
}

export function costWords(estimate: CostEstimate): string {
  const range =
    estimate.low === estimate.high
      ? money(estimate.high)
      : `${money(estimate.low)}–${money(estimate.high)}`;
  if (estimate.unknown > 0)
    return estimate.high === 0
      ? `Unknown: ${String(estimate.unknown)} ${estimate.unknown === 1 ? "step has" : "steps have"} no price yet. The remake review shows the rest before anything is charged.`
      : `About ${range}, plus ${String(estimate.unknown)} ${estimate.unknown === 1 ? "step" : "steps"} with no price yet.`;
  if (estimate.high === 0)
    return estimate.rows.some((row) => row.onPlan === true)
      ? "$0 on your CLI plan; it uses some of the plan's limits."
      : "No extra charge: it runs on this computer.";
  return `About ${range}.`;
}

// The Settings tab a missing choice is set on.
function sectionFor(field: string): EditSection {
  if (field.startsWith("imagePrompts") || field.endsWith("Prompt")) return "prompts";
  if (
    field.startsWith("audio") ||
    field.startsWith("voices") ||
    field.startsWith("images") ||
    field.startsWith("llm")
  )
    return "providers";
  return "inputs";
}
