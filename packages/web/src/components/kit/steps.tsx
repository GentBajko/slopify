import type { ReactElement, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Lamp, type Tone } from "./status.js";

export interface Step {
  readonly id: string;
  readonly name: ReactNode;
  readonly tone: Tone;
  // The state in words, read by screen readers after the name: "Running", "Held for you".
  readonly state: string;
  readonly time?: ReactNode;
  readonly detail?: ReactNode;
}

// A run's stages, top to bottom: lamp, name, time, and one detail line.
export function Steps({
  steps,
  label,
  className,
}: {
  readonly steps: readonly Step[];
  readonly label: string;
  readonly className?: string;
}): ReactElement {
  return (
    <ol aria-label={label} className={cn("sl-steps m-0 list-none p-0", className)}>
      {steps.map((step) => (
        <li key={step.id} className="sl-step" data-tone={step.tone}>
          <Lamp tone={step.tone} />
          <span className="sl-step__name">
            {step.name}
            <span className="sr-only">{`, ${step.state}`}</span>
          </span>
          <span className="sl-step__time">{step.time ?? "—"}</span>
          {step.detail === undefined ? null : (
            <span className="sl-step__detail">{step.detail}</span>
          )}
        </li>
      ))}
    </ol>
  );
}
