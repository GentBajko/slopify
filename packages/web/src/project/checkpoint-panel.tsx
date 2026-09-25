import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type ComponentProps, type ReactElement, useEffect, useRef, useState } from "react";
import { useApp } from "@/app-context";
import { Button } from "@/components/ui/button";
import { sentence } from "@/http";
import { keys } from "@/queries";
import {
  type ApprovalIdentity,
  approveCheckpoint,
  type CheckpointGate,
  type CheckpointStatus,
  checkpointKey,
  checkpointRevisionKey,
  checkpointStatus,
} from "./checkpoint-api.js";

import { CheckpointChoices } from "./checkpoint-choices.js";

const label = (stage: string): string => stage.charAt(0).toUpperCase() + stage.slice(1);
interface Props {
  readonly projectId: string;
  readonly revisionId: string | null;
  readonly paused: boolean;
  readonly stages: ComponentProps<typeof CheckpointChoices>["stages"];
}
export function CheckpointPanel(props: Props): ReactElement | null {
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
}: Props & { readonly revisionId: string }): ReactElement | null {
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
            (result?.ok === false
              ? result.message
              : "Checkpoints couldn't be loaded. Press Reload checkpoints.")}
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
          The project was edited after these checkpoints loaded. Press Reload checkpoints before
          approving.
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
}): ReactElement {
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
  async function approve(): Promise<void> {
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
            : { kind: "refused", message: result.message },
        );
      void client.invalidateQueries({ queryKey: checkpointKey(gate.projectId) });
      void client.invalidateQueries({ queryKey: keys.project(gate.projectId) });
      void client.invalidateQueries({ queryKey: keys.projects });
    } catch (error) {
      if (mounted.current)
        setOutcome({
          kind: "transport",
          message: `${sentence(error instanceof Error ? error.message : "Slopify didn't confirm the approval")} Press Retry approval to check whether it went through.`,
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
