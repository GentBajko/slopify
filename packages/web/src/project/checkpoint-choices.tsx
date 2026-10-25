import type { Stage } from "@app/slices/admission/model.js";
import { type ReactElement, useEffect, useRef, useState } from "react";
import { useApp } from "@/app-context";
import { Button } from "@/components/kit/button";
import { HelpLine } from "@/components/kit/field";
import { helpScope } from "@/components/kit/info-tip";
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
// Each pause is named for what is ready to look at when it holds the run, and what waits.
const choices = [
  { stage: "audio", name: "Pause after the article (before the narration)" },
  { stage: "images", name: "Pause after the narration (before the images)" },
  { stage: "video", name: "Pause after the images (before the video)" },
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
          "The pauses changed elsewhere. Press Load the pauses again before saving, then make your change again.",
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
            "The project was edited elsewhere. Press Load the pauses again to see its current ones.",
        });
      else {
        saved(result.value);
        setDraft(null);
        setOutcome({ kind: "success", message: "Pauses saved." });
      }
    } catch (error) {
      if (mounted.current)
        setOutcome({
          kind: "transport",
          message: `${sentence(error instanceof Error ? error.message : "Slopify didn't confirm the change")} It may or may not have saved. Press Load the pauses again before changing anything else.`,
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
  const enabledOf = (stage: (typeof choices)[number]["stage"]): boolean => {
    const current = stages.find((one) => one.kind === stage);
    return (
      current?.state === "pending" &&
      (stage === "video"
        ? current.source !== "off" ||
          stages.some(
            (one) => one.kind === "audio" && one.source !== "off" && one.state !== "skipped",
          )
        : (current.source ?? "generate") === "generate")
    );
  };
  // Nothing is left to pause: every step it could hold has run. Three greyed ticks would say
  // nothing a person can act on, so the run says so in one line instead.
  // A step still at work keeps its ticks in view (the run is going); an outdated PDF waiting
  // after an edit holds no pause.
  const finished =
    !dirty &&
    choices.every(({ stage }) => !enabledOf(stage)) &&
    stages.every((one) => one.state !== "running" && one.state !== "failed");
  if (finished)
    return (
      <section aria-label="Pauses for this run" className="space-y-1" {...helpScope}>
        <p className="m-0 font-semibold">Pauses for this run</p>
        <HelpLine>
          Nothing is left to pause: every step a pause can hold has run. Making something again
          starts once you have seen what it costs, without a pause.
        </HelpLine>
      </section>
    );
  return (
    <div className="space-y-2">
      <fieldset ref={group} tabIndex={-1} className="space-y-1" {...helpScope}>
        <legend className="font-semibold">Pauses for this run</legend>
        <HelpLine>The run waits under Home → Needs you until you approve what it made.</HelpLine>
        {choices.map(({ stage, name }) => {
          const enabled = enabledOf(stage);
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
              {name}
            </label>
          );
        })}
      </fieldset>
      {notice ? (
        <p ref={feedback} tabIndex={-1} role={notice.kind === "success" ? "status" : "alert"}>
          {notice.message}
        </p>
      ) : null}
      {/* Save appears once a pause is ticked or unticked; nothing waits to be saved before. */}
      {dirty ? (
        <Button type="button" disabled={pending || refused} onClick={() => void save()}>
          {pending ? "Saving…" : "Save pauses"}
        </Button>
      ) : null}
      {refused ? (
        <Button type="button" disabled={pending} onClick={() => void refresh()}>
          Load the pauses again
        </Button>
      ) : null}
    </div>
  );
}
