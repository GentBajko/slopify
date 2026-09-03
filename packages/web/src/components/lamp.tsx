import type { StageState } from "@app/kernel/pipeline.js";
import { cn } from "@/lib/utils";
import { StateWord } from "./state-word.js";

// A lamp never conveys state alone: the state word is always rendered beside it
// (uiux/02-system.md §Q18). `Lamp` is exported for the two places that already carry the
// word themselves; everywhere else uses `StageLamp`.
const lit: Readonly<Record<StageState, string>> = {
  pending: "bg-lamp-off shadow-[inset_0_0_0_1px_var(--color-lamp-ring)]",
  running:
    "bg-lamp-run shadow-[0_0_0_3px_var(--color-lamp-halo)] animate-lamp-pulse motion-reduce:animate-none",
  done: "bg-done",
  failed: "bg-red",
  canceled: "bg-amber",
  provided: "bg-lamp-off shadow-[inset_0_0_0_1px_var(--color-lamp-ring)]",
  skipped: "bg-lamp-off shadow-[inset_0_0_0_1px_var(--color-lamp-ring)]",
};

export function Lamp({
  state,
  className,
}: {
  readonly state: StageState;
  readonly className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      data-lamp={state}
      className={cn("size-[10px] shrink-0 rounded-full", lit[state], className)}
    />
  );
}

export function StageLamp({
  label,
  state,
  className,
}: {
  // What the announcement names: "Audio: running" (uiux/03-experience.md).
  readonly label: string;
  readonly state: StageState;
  readonly className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <Lamp state={state} />
      <StateWord state={state} />
      <span className="sr-only" role="status" aria-live="polite">
        {`${label}: ${state}`}
      </span>
    </span>
  );
}
