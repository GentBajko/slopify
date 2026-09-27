import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type ComponentProps, type ReactElement, useEffect, useRef, useState } from "react";
import { useApp } from "@/app-context";
import { Button } from "@/components/kit/button";
import { SectionHead } from "@/components/kit/section-head";
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
  // The gate the project's next action approves: its button is in the right rail, so the
  // row here says so instead of offering a second one.
  readonly approvedInRail?: string | undefined;
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
  approvedInRail,
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
      <section aria-label="Review checkpoints" className="flex flex-col items-start gap-3">
        <p role="alert" className="m-0 text-small text-danger">
          {status.error?.message ??
            (result?.ok === false
              ? result.message
              : "Checkpoints couldn't be loaded. Press Reload checkpoints.")}
        </p>
        <Button onClick={() => void reload()}>Reload checkpoints</Button>
      </section>
    );
  if (!result?.ok) return null;
  if (result.value.revisionId !== revisionId)
    return (
      <section aria-label="Review checkpoints" className="flex flex-col items-start gap-3">
        <p role="alert" className="m-0 text-small text-danger">
          The project was edited after these checkpoints loaded. Press Reload checkpoints before
          approving.
        </p>
      </section>
    );
  return (
    <section aria-label="Review checkpoints" className="flex flex-col gap-5">
      <SectionHead title="Review checkpoints" size="small" className="pb-0" />
      {paused ? (
        <p className="m-0 text-small text-waiting">
          The project is paused. Continue the run before approving held work.
        </p>
      ) : null}
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
          {...(gate.checkpointId === approvedInRail ? { inRail: true } : {})}
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
  inRail = false,
}: {
  readonly gate: CheckpointGate;
  readonly disabled: boolean;
  readonly reload: () => Promise<boolean>;
  readonly inRail?: boolean;
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
    <div className="flex flex-col gap-2 border-t border-line pt-4">
      <SectionHead as="h3" title={`${label(gate.stage)} checkpoint`} className="pb-0" />
      <p className="m-0 text-small text-ink-2">
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
      <p className="m-0 text-small text-ink-3">Reviewed revision: {gate.revisionId}</p>
      {gate.dependents.length ? (
        <ul aria-label="Dependent work" className="m-0 flex list-none flex-wrap gap-2 p-0">
          {gate.dependents.map((stage) => (
            <li key={stage} className="sl-chip">
              {label(stage)}
            </li>
          ))}
        </ul>
      ) : (
        <p className="m-0 text-small text-ink-2">No dependent stages.</p>
      )}
      {outcome ? (
        <p
          ref={feedback}
          tabIndex={-1}
          role={outcome.kind === "success" ? "status" : "alert"}
          className={outcome.kind === "success" ? "m-0 text-small" : "m-0 text-small text-danger"}
        >
          {outcome.message}
        </p>
      ) : null}
      {eligible && inRail && outcome === null ? (
        <p className="m-0 text-small text-ink-2">
          Its approval is the project's next action, in the right rail.
        </p>
      ) : eligible ? (
        <Button
          className="self-start"
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
          className="self-start"
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
