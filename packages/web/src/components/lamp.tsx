import type { ProjectState, StageState } from "@app/kernel/pipeline.js";
import { cn } from "@/lib/utils";
import { StateWord } from "./state-word.js";

// A lamp never conveys state alone: the state word is always rendered beside it. In a rundown
// row the two sit at opposite ends, so the row composes `Lamp` and `StateWord` itself;
// `StageLamp` is the pair for everywhere else.
const lit: Readonly<Record<StageState | ProjectState, string>> = {
  pending: "bg-line shadow-[inset_0_0_0_1px_var(--color-line-strong)]",
  running:
    "bg-accent shadow-[0_0_0_3px_var(--color-accent-tint)] animate-lamp-pulse motion-reduce:animate-none",
  done: "bg-accent-ink",
  failed: "bg-danger",
  partial: "bg-waiting",
  canceled: "bg-waiting",
  paused: "bg-waiting",
  provided: "bg-line shadow-[inset_0_0_0_1px_var(--color-line-strong)]",
  skipped: "bg-line shadow-[inset_0_0_0_1px_var(--color-line-strong)]",
};

export function Lamp({
  state,
  className,
}: {
  readonly state: StageState | ProjectState;
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
  readonly label: string;
  readonly state: StageState | ProjectState;
  readonly className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <Lamp state={state} />
      <StateWord state={state} announce={label} />
    </span>
  );
}
