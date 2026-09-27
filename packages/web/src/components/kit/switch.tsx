import { type KeyboardEvent, type ReactElement, type ReactNode, useRef } from "react";
import type { HelpId } from "@/help/catalog";
import { cn } from "@/lib/utils";
import { helpScope, InfoTip } from "./info-tip.js";

// An on/off setting that applies at once. The label is part of the button, so the whole row
// toggles and the name is read with the state.
export function Switch({
  checked,
  onChange,
  label,
  disabled,
  className,
  describedBy,
  tip,
  tipLabel,
}: {
  readonly checked: boolean;
  readonly onChange: (next: boolean) => void;
  readonly label: ReactNode;
  readonly disabled?: boolean;
  readonly className?: string;
  readonly describedBy?: string;
  // The info button after the switch; `tipLabel` names it when `label` is not plain text.
  readonly tip?: HelpId;
  readonly tipLabel?: string;
}): ReactElement {
  const button = (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-describedby={describedBy}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn("sl-switch", className)}
    >
      <span className="sl-switch__track" aria-hidden="true" />
      <span>{label}</span>
    </button>
  );
  if (tip === undefined) return button;
  return (
    <span className="inline-flex max-w-full items-center gap-1" {...helpScope}>
      {button}
      <InfoTip id={tip} label={tipLabel ?? (typeof label === "string" ? label : undefined)} />
    </span>
  );
}

export interface SegmentedOption<T extends string> {
  readonly value: T;
  readonly label: ReactNode;
  readonly disabled?: boolean;
}

// A small choice of two to five, all visible: pressed buttons in a group, arrow keys move.
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  className,
  tip,
}: {
  readonly value: T;
  readonly options: readonly SegmentedOption<T>[];
  readonly onChange: (next: T) => void;
  // The group's accessible name.
  readonly label: string;
  readonly className?: string;
  // The info button after the group.
  readonly tip?: HelpId;
}): ReactElement {
  const group = useRef<HTMLDivElement>(null);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    const enabled = options.filter((option) => !option.disabled);
    const at = enabled.findIndex((option) => option.value === value);
    const next =
      enabled[(at + (event.key === "ArrowRight" ? 1 : -1) + enabled.length) % enabled.length];
    if (next === undefined) return;
    event.preventDefault();
    onChange(next.value);
    group.current?.querySelector<HTMLElement>(`[data-value="${CSS.escape(next.value)}"]`)?.focus();
  };
  const segmented = (
    // biome-ignore lint/a11y/useSemanticElements: an inline row of toggle buttons; a fieldset's legend and box would fight the segmented look.
    <div
      ref={group}
      role="group"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={cn("sl-seg", className)}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          data-value={option.value}
          aria-pressed={option.value === value}
          tabIndex={option.value === value ? 0 : -1}
          disabled={option.disabled}
          onClick={() => onChange(option.value)}
          className="sl-seg__opt"
        >
          {option.label}
        </button>
      ))}
    </div>
  );
  if (tip === undefined) return segmented;
  return (
    <span className="inline-flex max-w-full items-center gap-1" {...helpScope}>
      {segmented}
      <InfoTip id={tip} label={label} />
    </span>
  );
}
