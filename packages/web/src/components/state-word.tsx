import type { StageState } from "@app/kernel/pipeline.js";
import { cn } from "@/lib/utils";

// The uppercase engraved label beside every lamp (uiux/03-experience.md, Copy register).
// The casing is CSS, so the accessible name stays the ordinary word and a screen reader
// reads "running" rather than spelling it out.
const tones: Readonly<Record<StageState, string>> = {
  pending: "text-ink3",
  running: "text-run-text",
  done: "text-done",
  failed: "text-red",
  canceled: "text-amber",
  provided: "text-ink2",
  skipped: "text-ink3",
};

export function StateWord({
  state,
  announce,
  className,
}: {
  readonly state: StageState;
  // What a change is announced as: "Audio: running" (uiux/03-experience.md, accessibility
  // floor). A row that can change state while the page is open passes its name.
  readonly announce?: string;
  readonly className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center", className)}>
      <span data-state={state} className={cn("engraved font-bold", tones[state])}>
        {state}
      </span>
      {announce === undefined ? null : (
        <span className="sr-only" role="status" aria-live="polite">
          {`${announce}: ${state}`}
        </span>
      )}
    </span>
  );
}
