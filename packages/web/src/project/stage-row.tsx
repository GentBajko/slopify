import type { ProjectSummary, Stage } from "@app/slices/admission/model.js";
import type { ProviderStatus } from "@app/slices/settings/model.js";
import type { Output } from "@app/slices/storage/model.js";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { StageGlyph } from "@/components/glyph";
import { Lamp } from "@/components/lamp";
import { Rail, RailMeter } from "@/components/rail";
import { StateWord } from "@/components/state-word";
import { RefusalLine } from "./parts.js";
import { unreadyFor } from "./readiness.js";
import { attempts, stageNames, summaryOf } from "./summary.js";
import type { ProjectActions } from "./use-actions.js";

// One row of the rundown and the body it opens into. The five columns are the reference
// sheet's - lamp, glyph, name, summary, state word - and a failed stage puts a sixth thing
// across them: the provider's own words with its Retry
// (uiux/screens/08-project.md, States).

const grid = "grid grid-cols-[14px_24px_110px_minmax(0,1fr)_auto] gap-[14px] items-center py-3";

// The body is open once the stage has something in it, and collapsed while it is still
// waiting or was switched off (uiux/screens/08-project.md, Composition).
const opened: ReadonlySet<Stage["state"]> = new Set([
  "running",
  "done",
  "failed",
  "canceled",
  "provided",
]);

export function StageRow({
  stage,
  project,
  outputs,
  providers,
  actions,
  children,
}: {
  readonly stage: Stage;
  readonly project: ProjectSummary;
  readonly outputs: readonly Output[];
  readonly providers: readonly ProviderStatus[];
  readonly actions: ProjectActions;
  readonly children: ReactNode;
}) {
  const name = stageNames[stage.kind];
  const refused = actions.refusal?.stage === stage.kind ? actions.refusal.message : undefined;
  const unready = unreadyFor(stage.kind, project.config, providers);
  const retryable = stage.state === "failed" || stage.state === "canceled";

  return (
    <div className="border-b border-line last:border-b-0">
      <Rail className={`${grid} border-b-0`}>
        <Lamp state={stage.state} />
        <StageGlyph kind={stage.kind} className="text-ink2" />
        <span className="font-semibold">{name}</span>
        <span className="truncate text-small text-ink2">{summaryOf(stage, outputs, project)}</span>
        <StateWord state={stage.state} announce={name} />

        {stage.state === "failed" ? (
          <ErrorLine stage={stage} unready={unready} actions={actions} />
        ) : null}
        {stage.state === "canceled" ? (
          <div className="col-span-4 col-start-2 mt-[10px] flex justify-end">
            <RetryButton stage={stage} unready={unready} actions={actions} />
          </div>
        ) : null}
        {stage.state === "running" && stage.progressTotal !== null ? (
          <RailMeter current={stage.progressCurrent ?? 0} total={stage.progressTotal} />
        ) : null}
        {retryable && unready !== undefined ? (
          <p className="col-span-4 col-start-2 text-small text-ink2">
            {`${unready.label} for ${unready.provider}. `}
            <Link to="/settings" className="underline underline-offset-[3px]">
              Open Settings
            </Link>
          </p>
        ) : null}
      </Rail>
      {refused === undefined ? null : (
        <div className="px-4 pb-3 pl-[66px]">
          <RefusalLine message={refused} onDismiss={actions.dismissRefusal} />
        </div>
      )}
      {opened.has(stage.state) ? children : null}
    </div>
  );
}

// `logic/01` §Q10: "the stage shows the provider's error text verbatim and the attempt
// count". The text is placed as its own node and nothing here shortens, wraps or rewrites
// it; it is the user's only diagnostic. The backend redacted it on its way out of the
// attempt wrapper (kernel/log.ts), and no other field of the stage is rendered here.
function ErrorLine({
  stage,
  unready,
  actions,
}: {
  readonly stage: Stage;
  readonly unready: ReturnType<typeof unreadyFor>;
  readonly actions: ProjectActions;
}) {
  return (
    <div className="col-span-4 col-start-2 mt-[10px] flex flex-wrap items-center gap-3 rounded-control bg-red-tint px-[10px] py-[6px] text-label text-red">
      <span className="min-w-0 break-words">{stage.failureReason ?? "The stage failed."}</span>
      <span className="shrink-0 text-ink2">{attempts(stage)}</span>
      <span className="ml-auto">
        <RetryButton stage={stage} unready={unready} actions={actions} />
      </span>
    </div>
  );
}

// Retry is the recovery, not a destruction: `slices/reruns` leaves the stage's finished
// pieces and outputs where they are, so it goes straight through without a dialog
// (`logic/13` step 5, `uiux/03-experience.md` Error recovery).
function RetryButton({
  stage,
  unready,
  actions,
}: {
  readonly stage: Stage;
  readonly unready: ReturnType<typeof unreadyFor>;
  readonly actions: ProjectActions;
}) {
  return (
    <button
      type="button"
      disabled={unready !== undefined || actions.pending}
      onClick={() => {
        actions.run({ kind: "retry", stage: stage.kind });
      }}
      className="rounded-control border border-red bg-transparent px-[9px] py-[3px] text-label text-ink hover:bg-panel2"
    >
      {unready === undefined ? "Retry stage" : unready.label}
    </button>
  );
}
