import type { Stage } from "@app/slices/admission/model.js";
import { type ReactElement, useEffect, useRef, useState } from "react";
import { useApp } from "@/app-context";
import { Button } from "@/components/ui/button";
import { sentence } from "@/http";
import {
  type CheckpointChange,
  type CheckpointGate,
  type CheckpointStatus,
  changeCheckpointChoices,
} from "./checkpoint-api.js";

type Outcome = {
  readonly kind: "success" | "transport" | "refused";
  readonly message: string;
} | null;
const choices = [
  { stage: "audio", name: "Audio" },
  { stage: "images", name: "Images" },
  { stage: "video", name: "Video / export" },
] as const;
export function CheckpointChoices({
  projectId,
  revisionId,
  gates,
  stages,
  reload,
  saved,
}: {
  readonly projectId: string;
  readonly revisionId: string;
  readonly gates: readonly CheckpointGate[];
  readonly stages: readonly (Pick<Stage, "kind" | "state"> & Partial<Pick<Stage, "source">>)[];
  readonly reload: () => Promise<CheckpointStatus | undefined>;
  readonly saved: (status: CheckpointStatus) => void;
}): ReactElement {
  const { api } = useApp();
  const [draft, setDraft] = useState<{
    readonly stages: CheckpointChange["stages"];
    readonly baseIdentity: string;
  } | null>(null);
  const [pending, setPending] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>(null);
  const active = useRef(false);
  const mounted = useRef(true);
  const feedback = useRef<HTMLParagraphElement>(null);
  const group = useRef<HTMLFieldSetElement>(null);
  const identity = JSON.stringify([
    revisionId,
    gates.map((gate) => [gate.stage, gate.checkpointId]).toSorted(),
  ]);
  const concurrent = draft !== null && draft.baseIdentity !== identity;
  const selected = draft?.stages ?? gates.map((gate) => gate.stage);
  const dirty = choices.some(
    ({ stage }) => selected.includes(stage) !== gates.some((gate) => gate.stage === stage),
  );
  const refused = concurrent || (outcome !== null && outcome.kind !== "success");
  const notice: Outcome = concurrent
    ? {
        kind: "refused",
        message:
          "Checkpoint choices changed elsewhere. Press Reload checkpoint choices before saving, then make your change again.",
      }
    : outcome;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (outcome || concurrent) feedback.current?.focus();
  }, [outcome, concurrent]);
  async function save(): Promise<void> {
    if (active.current || !dirty || refused) return;
    active.current = true;
    setPending(true);
    try {
      const result = await changeCheckpointChoices(api, projectId, {
        revisionId,
        stages: selected,
      });
      if (!mounted.current) return;
      if (!result.ok) setOutcome({ kind: "refused", message: result.message });
      else if (result.value.revisionId !== revisionId)
        setOutcome({
          kind: "refused",
          message:
            "The project was edited elsewhere. Press Reload checkpoint choices to see its current choices.",
        });
      else {
        saved(result.value);
        setDraft(null);
        setOutcome({ kind: "success", message: "Checkpoint choices saved." });
      }
    } catch (error) {
      if (mounted.current)
        setOutcome({
          kind: "transport",
          message: `${sentence(error instanceof Error ? error.message : "Slopify didn't confirm the change")} It may or may not have saved. Press Reload checkpoint choices before changing anything else.`,
        });
    } finally {
      active.current = false;
      if (mounted.current) setPending(false);
    }
  }
  async function refresh(): Promise<void> {
    if (active.current) return;
    active.current = true;
    setPending(true);
    try {
      const next = await reload();
      if (mounted.current && next) {
        setDraft(null);
        setOutcome(null);
        group.current?.focus();
      }
    } finally {
      active.current = false;
      if (mounted.current) setPending(false);
    }
  }
  return (
    <div className="space-y-2">
      <fieldset ref={group} tabIndex={-1} className="space-y-2">
        <legend>Checkpoint choices</legend>
        <p>
          Change checkpoints before a step starts. Removing one lets its already-admitted work
          continue when ready; project pause still applies.
        </p>
        {choices.map(({ stage, name }) => {
          const current = stages.find((one) => one.kind === stage);
          const enabled =
            current?.state === "pending" &&
            (stage === "video"
              ? current.source !== "off" ||
                stages.some(
                  (one) => one.kind === "audio" && one.source !== "off" && one.state !== "skipped",
                )
              : (current.source ?? "generate") === "generate");
          return (
            <label key={stage} className="flex min-h-10 items-center gap-3">
              <input
                type="checkbox"
                checked={selected.includes(stage)}
                disabled={!enabled || pending || refused}
                onChange={(event) => {
                  setDraft({
                    baseIdentity: draft?.baseIdentity ?? identity,
                    stages: event.target.checked
                      ? [...selected, stage]
                      : selected.filter((one) => one !== stage),
                  });
                  setOutcome(null);
                }}
              />
              Before {name}
            </label>
          );
        })}
      </fieldset>
      {notice ? (
        <p ref={feedback} tabIndex={-1} role={notice.kind === "success" ? "status" : "alert"}>
          {notice.message}
        </p>
      ) : null}
      <Button type="button" disabled={!dirty || pending || refused} onClick={() => void save()}>
        {pending ? "Saving…" : "Save checkpoints"}
      </Button>
      {refused ? (
        <Button type="button" disabled={pending} onClick={() => void refresh()}>
          Reload checkpoint choices
        </Button>
      ) : null}
    </div>
  );
}
