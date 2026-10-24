import type { StageKind } from "@app/kernel/pipeline.js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type ComponentProps, type ReactElement, useEffect, useRef, useState } from "react";
import { useApp } from "@/app-context";
import { Button } from "@/components/kit/button";
import { sentence } from "@/http";
import { stageWords } from "@/lib/stage-words";
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

const label = (stage: StageKind): string => stageWords[stage];
const lower = (stage: StageKind): string => stageWords[stage].toLowerCase();

// The pauses for this run, at the top of Settings → Pauses and checks: which steps the run
// stops after, and each pause that holds work now, with its Approve. The same approval is the
// title row's next action; here it sits with the pause it ends.
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
      <section aria-label="Pauses" className="flex flex-col items-start gap-3">
        <p role="alert" className="m-0 text-small text-danger">
          {status.error?.message ??
            (result?.ok === false
              ? result.message
              : "The pauses couldn't be loaded. Press Load the reviews again.")}
        </p>
        <Button onClick={() => void reload()}>Load the reviews again</Button>
      </section>
    );
  if (!result?.ok) return null;
  if (result.value.revisionId !== revisionId)
    return (
      <section aria-label="Pauses" className="flex flex-col items-start gap-3">
        <p role="alert" className="m-0 text-small text-danger">
          The project was edited after these pauses loaded. Press Load the reviews again before
          approving.
        </p>
      </section>
    );
  return (
    <section aria-label="Pauses" className="flex flex-col gap-4">
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
      {result.value.checkpoints.filter(worthShowing).map((gate) => (
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
          current={gate.revisionId === revisionId}
        />
      ))}
    </section>
  );
}
type Outcome = {
  readonly kind: "success" | "transport" | "refused";
  readonly message: string;
} | null;
// A pause worth a row of its own: one that holds work, was approved, or whose inputs changed.
// A pause the run has not reached is its tick above.
function worthShowing(gate: CheckpointGate): boolean {
  return gate.state !== "configured" || gate.fingerprint !== gate.currentFingerprint;
}

function Gate({
  gate,
  disabled,
  reload,
  current,
}: {
  readonly gate: CheckpointGate;
  readonly disabled: boolean;
  readonly reload: () => Promise<boolean>;
  // The gate belongs to the version of the project on screen.
  readonly current: boolean;
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
                  ? "It was already approved."
                  : "Approved. What comes after it runs once what it needs is ready.",
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
    <div className="flex flex-col gap-2 border-t border-line pt-3">
      <h3 className="m-0 text-title-3">{`Paused after the ${previousOf(gate.stage)}`}</h3>
      <p className="m-0 text-small text-ink-2">
        {gate.state === "released" && gate.approvedAt !== null
          ? "Approved for this version. What comes after it runs once what it needs is ready and the run goes on."
          : gate.state === "satisfied"
            ? "Approved, and what came after it is made."
            : gate.state === "invalidated" || gate.fingerprint !== gate.currentFingerprint
              ? "What it was made from has changed. Look at the current version before approving."
              : eligible
                ? `The ${previousOf(gate.stage)} ${isAre(gate.stage)} ready for your review. The ${lower(gate.stage)} and what follows wait for your approval; other work goes on.`
                : "Not reached yet."}
      </p>
      {/* The version's id stays on hover for a bug report; the line itself says which one. */}
      {current ? null : (
        <p className="m-0 text-small text-ink-3" title={`Version ${gate.revisionId}`}>
          Set on an earlier version. Press Load the reviews again to see the current one.
        </p>
      )}
      {gate.dependents.length === 0 ? null : (
        <ul aria-label="Waits for this approval" className="m-0 flex list-none flex-wrap gap-2 p-0">
          {gate.dependents.map((stage) => (
            <li key={stage} className="sl-chip">
              {label(stage)}
            </li>
          ))}
        </ul>
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
      {eligible ? (
        <Button
          className="self-start"
          disabled={
            disabled || pending || outcome?.kind === "refused" || outcome?.kind === "success"
          }
          disabledReason={
            disabled ? "Continue the run first, then approve" : "Working on the last press"
          }
          onClick={() => void approve()}
        >
          {pending
            ? "Approving…"
            : outcome?.kind === "transport"
              ? "Retry approval"
              : `Approve and make the ${lower(gate.stage)}`}
        </Button>
      ) : null}
      {outcome?.kind === "refused" ? (
        <Button
          className="self-start"
          onClick={async () => {
            if (await reload()) setOutcome(null);
          }}
        >
          Load the reviews again
        </Button>
      ) : null}
    </div>
  );
}

// What a pause before a stage holds for review: the step that comes before it. A pause holds
// its own stage and everything made from it (`slices/checkpoints/fingerprint.ts`).
function previousOf(stage: StageKind): string {
  switch (stage) {
    case "audio":
      return "article";
    case "images":
      return "narration";
    case "video":
      return "images";
    default:
      return lower(stage);
  }
}

const isAre = (stage: StageKind): string => (stage === "video" ? "are" : "is");
