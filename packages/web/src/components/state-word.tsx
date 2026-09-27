import type { ProjectState, StageState } from "@app/kernel/pipeline.js";
import { cn } from "@/lib/utils";

// The uppercase engraved label beside every lamp. The casing is CSS, so the accessible name
// stays the ordinary word and a screen reader reads "running" rather than spelling it out.
const tones: Readonly<Record<StageState | ProjectState, string>> = {
  pending: "text-ink-3",
  running: "text-accent-ink",
  done: "text-accent-ink",
  failed: "text-danger",
  partial: "text-waiting",
  canceled: "text-waiting",
  paused: "text-waiting",
  provided: "text-ink-2",
  skipped: "text-ink-3",
};

// A state whose name is not the word a person would use.
const words: Readonly<Partial<Record<StageState | ProjectState, string>>> = {
  partial: "done with problems",
};

export function StateWord({
  state,
  announce,
  className,
}: {
  readonly state: StageState | ProjectState;
  // What a change is announced as: "Audio: running". A row that can change state while the page
  // is open passes its name.
  readonly announce?: string;
  readonly className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center", className)}>
      <span data-state={state} className={cn("engraved font-bold", tones[state])}>
        {words[state] ?? state}
      </span>
      {announce === undefined ? null : (
        <span className="sr-only" role="status" aria-live="polite">
          {`${announce}: ${words[state] ?? state}`}
        </span>
      )}
    </span>
  );
}
