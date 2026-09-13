import type { StageKind, StageState } from "@app/kernel/pipeline.js";
import type { StageSource } from "@app/slices/admission/model.js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useApp } from "@/app-context";
import { Button } from "@/components/ui/button";
import { keys } from "@/queries";
import {
  type ApprovalIdentity,
  approveCheckpoint,
  type CheckpointChange,
  type CheckpointGate,
  type CheckpointStatus,
  changeCheckpointChoices,
  checkpointKey,
  checkpointRevisionKey,
  checkpointStatus,
} from "./checkpoint-api.js";

const label = (stage: string): string => stage.charAt(0).toUpperCase() + stage.slice(1);
interface Props {
  readonly projectId: string;
  readonly revisionId: string | null;
  readonly paused: boolean;
  readonly stages: readonly {
    readonly kind: StageKind;
    readonly state: StageState;
    readonly source?: StageSource;
  }[];
}
export function CheckpointPanel(props: Props) {
  if (props.revisionId === null) return null;
  return (
    <CurrentCheckpoints
      key={`${props.projectId}:${props.revisionId}`}
      {...props}
      revisionId={props.revisionId}
    />
  );
}
function CurrentCheckpoints({
  projectId,
  revisionId,
  paused,
  stages,
}: Props & { readonly revisionId: string }) {
  const { api } = useApp();
  const client = useQueryClient();
  const status = useQuery({
    queryKey: checkpointRevisionKey(projectId, revisionId),
    queryFn: () => checkpointStatus(api, projectId),
    retry: false,
  });
  const result = status.data;
  const reloadChoices = async (): Promise<CheckpointStatus | undefined> => {
    const next = await status.refetch();
    return !next.isError && next.data?.ok === true && next.data.value.revisionId === revisionId
      ? next.data.value
      : undefined;
  };
  const reload = async (): Promise<boolean> => {
    const next = await status.refetch();
    return !next.isError && next.data?.ok === true && next.data.value.revisionId === revisionId;
  };
  if (status.isPending) return null;
  if (status.error || result?.ok === false)
    return (
      <section aria-label="Review checkpoints">
        <p role="alert">
          {status.error?.message ??
            (result?.ok === false ? result.message : "Checkpoint status unavailable.")}
        </p>
        <Button type="button" onClick={() => void reload()}>
          Reload checkpoints
        </Button>
      </section>
    );
  if (!result?.ok) return null;
  if (result.value.revisionId !== revisionId)
    return (
      <section aria-label="Review checkpoints">
        <p role="alert">
          Checkpoint status belongs to another revision. Reload the project before approving.
        </p>
      </section>
    );
  return (
    <section
      aria-label="Review checkpoints"
      className="space-y-3 rounded-panel border border-line bg-panel p-4"
    >
      <h2>Review checkpoints</h2>
      {paused ? <p>Project is paused. Resume it before approving held work.</p> : null}
      <CheckpointChoices
        projectId={projectId}
        revisionId={revisionId}
        gates={result.value.checkpoints}
        stages={stages}
        reload={reloadChoices}
        saved={(value) => {
          client.setQueryData(checkpointRevisionKey(projectId, revisionId), { ok: true, value });
          void client.invalidateQueries({ queryKey: keys.project(projectId) });
          void client.invalidateQueries({ queryKey: keys.projects });
        }}
      />
      {result.value.checkpoints.map((gate) => (
        <Gate
          key={`${gate.checkpointId}:${gate.fingerprint}`}
          gate={gate}
          disabled={
            paused ||
            gate.projectId !== projectId ||
            gate.revisionId !== revisionId ||
            stages.some(
              (stage) => stage.kind === gate.stage && ["running", "canceled"].includes(stage.state),
            )
          }
          reload={reload}
        />
      ))}
    </section>
  );
}
type Outcome = {
  readonly kind: "success" | "transport" | "refused";
  readonly message: string;
} | null;
function Gate({
  gate,
  disabled,
  reload,
}: {
  readonly gate: CheckpointGate;
  readonly disabled: boolean;
  readonly reload: () => Promise<boolean>;
}) {
  const { api } = useApp();
  const client = useQueryClient();
  const identity = useRef<ApprovalIdentity | null>(null);
  const active = useRef(false);
  const mounted = useRef(true);
  const feedback = useRef<HTMLParagraphElement>(null);
  const [pending, setPending] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (outcome !== null) feedback.current?.focus();
  }, [outcome]);
  const eligible =
    ["configured", "pending-review", "held"].includes(gate.state) &&
    gate.fingerprint === gate.currentFingerprint;
  async function approve() {
    if (
      active.current ||
      disabled ||
      !eligible ||
      outcome?.kind === "refused" ||
      outcome?.kind === "success"
    )
      return;
    active.current = true;
    setPending(true);
    identity.current ??= {
      revisionId: gate.revisionId,
      fingerprint: gate.fingerprint,
      idempotencyKey: crypto.randomUUID(),
    };
    try {
      const result = await approveCheckpoint(
        api,
        gate.projectId,
        gate.checkpointId,
        identity.current,
      );
      identity.current = null;
      if (mounted.current)
        setOutcome(
          result.ok
            ? {
                kind: "success",
                message: result.value.replayed
                  ? "Checkpoint already approved."
                  : "Checkpoint approved. Work will run when its dependencies are ready.",
              }
            : { kind: "refused", message: `${result.message} (${result.reason})` },
        );
      void client.invalidateQueries({ queryKey: checkpointKey(gate.projectId) });
      void client.invalidateQueries({ queryKey: keys.project(gate.projectId) });
      void client.invalidateQueries({ queryKey: keys.projects });
    } catch (error) {
      if (mounted.current)
        setOutcome({
          kind: "transport",
          message: `${error instanceof Error ? error.message : "Approval response unavailable."} Retry to check the same approval request.`,
        });
    } finally {
      active.current = false;
      if (mounted.current) setPending(false);
    }
  }
  return (
    <div className="space-y-2 rounded-control border border-line p-3">
      <h3>{label(gate.stage)} checkpoint</h3>
      <p>
        {gate.state === "released" && gate.approvedAt !== null
          ? "Authorized for this revision. Work can run when dependencies are ready and the project is resumed."
          : gate.state === "satisfied"
            ? "Checkpoint satisfied. Its reviewed work is complete."
            : gate.state === "invalidated" || gate.fingerprint !== gate.currentFingerprint
              ? "Inputs changed. Review the current revision before approving."
              : eligible
                ? `${label(gate.stage)} is held for your review. Its dependent work waits for this approval; independent work can continue.`
                : `Checkpoint ${gate.state}.`}
      </p>
      <p>Reviewed revision: {gate.revisionId}</p>
      {gate.dependents.length ? (
        <ul aria-label="Dependent work">
          {gate.dependents.map((stage) => (
            <li key={stage}>{label(stage)}</li>
          ))}
        </ul>
      ) : (
        <p>No dependent stages.</p>
      )}
      {outcome ? (
        <p ref={feedback} tabIndex={-1} role={outcome.kind === "success" ? "status" : "alert"}>
          {outcome.message}
        </p>
      ) : null}
      {eligible ? (
        <Button
          type="button"
          disabled={
            disabled || pending || outcome?.kind === "refused" || outcome?.kind === "success"
          }
          onClick={() => void approve()}
        >
          {pending
            ? "Approving…"
            : outcome?.kind === "transport"
              ? "Retry approval"
              : `Approve ${label(gate.stage)} checkpoint`}
        </Button>
      ) : null}
      {outcome?.kind === "refused" ? (
        <Button
          type="button"
          onClick={async () => {
            if (await reload()) setOutcome(null);
          }}
        >
          Reload checkpoints
        </Button>
      ) : null}
    </div>
  );
}

const choices = [
  { stage: "audio", name: "Audio" },
  { stage: "images", name: "Images" },
  { stage: "video", name: "Video / export" },
] as const;
function CheckpointChoices({
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
  readonly stages: Props["stages"];
  readonly reload: () => Promise<CheckpointStatus | undefined>;
  readonly saved: (status: CheckpointStatus) => void;
}) {
  const { api } = useApp();
  const [draft, setDraft] = useState<CheckpointChange["stages"] | null>(null);
  const [pending, setPending] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>(null);
  const active = useRef(false);
  const mounted = useRef(true);
  const feedback = useRef<HTMLParagraphElement>(null);
  const group = useRef<HTMLFieldSetElement>(null);
  const selected = draft ?? gates.map((gate) => gate.stage);
  const dirty = choices.some(
    ({ stage }) => selected.includes(stage) !== gates.some((gate) => gate.stage === stage),
  );
  const refused = outcome !== null && outcome.kind !== "success";
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (outcome) feedback.current?.focus();
  }, [outcome]);
  async function save() {
    if (active.current || !dirty || refused) return;
    active.current = true;
    setPending(true);
    try {
      const result = await changeCheckpointChoices(api, projectId, {
        revisionId,
        stages: selected,
      });
      if (!mounted.current) return;
      if (!result.ok)
        setOutcome({ kind: "refused", message: `${result.message} (${result.reason})` });
      else if (result.value.revisionId !== revisionId)
        setOutcome({
          kind: "refused",
          message: "The project revision changed. Reload checkpoint choices.",
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
          message: `${error instanceof Error ? error.message : "Checkpoint response unavailable."} Reload checkpoint choices before making another change.`,
        });
    } finally {
      active.current = false;
      if (mounted.current) setPending(false);
    }
  }
  async function refresh() {
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
                  setDraft(
                    event.target.checked
                      ? [...selected, stage]
                      : selected.filter((one) => one !== stage),
                  );
                  setOutcome(null);
                }}
              />
              Before {name}
            </label>
          );
        })}
      </fieldset>
      {outcome ? (
        <p ref={feedback} tabIndex={-1} role={outcome.kind === "success" ? "status" : "alert"}>
          {outcome.message}
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
