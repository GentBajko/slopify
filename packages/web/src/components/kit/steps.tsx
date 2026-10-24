import type { ReactElement, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Lamp, type Tone } from "./status.js";

export interface Step {
  readonly id: string;
  readonly name: ReactNode;
  readonly tone: Tone;
  // The state in words, shown beside the lamp: "Done", "Running", "Waiting for your review".
  readonly state: string;
  readonly time?: ReactNode;
  readonly detail?: ReactNode;
}

// A run's stages, top to bottom: lamp, name, time, then the state in words before one detail
// line ("Done · 4 images"), so the lamp is never the only sign of how a stage stands.
export function Steps({
  steps,
  label,
  dense = false,
  className,
}: {
  readonly steps: readonly Step[];
  readonly label: string;
  // One line per step, the state and detail beside the name: a rail that shows the whole run
  // at a glance.
  readonly dense?: boolean;
  readonly className?: string;
}): ReactElement {
  return (
    <ol
      aria-label={label}
      className={cn("sl-steps m-0 list-none p-0", dense && "sl-steps--dense", className)}
    >
      {steps.map((step) => {
        // A detail that only repeats the state ("Provided · Provided") is said once.
        const detail = step.detail === step.state ? undefined : step.detail;
        return (
          <li key={step.id} className="sl-step" data-tone={step.tone}>
            <Lamp tone={step.tone} />
            <span className="sl-step__name">{step.name}</span>
            <span className="sl-step__time">{step.time ?? "—"}</span>
            <span className="sl-step__detail">
              <span className="sl-step__state">{step.state}</span>
              {detail === undefined ? null : (
                <>
                  <span className="sl-step__dot"> · </span>
                  <span>{detail}</span>
                </>
              )}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
