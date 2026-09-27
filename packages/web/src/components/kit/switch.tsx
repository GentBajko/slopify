import { type KeyboardEvent, type ReactElement, type ReactNode, useRef } from "react";
import { cn } from "@/lib/utils";

// An on/off setting that applies at once. The label is part of the button, so the whole row
// toggles and the name is read with the state.
export function Switch({
  checked,
  onChange,
  label,
  disabled,
  className,
  describedBy,
}: {
  readonly checked: boolean;
  readonly onChange: (next: boolean) => void;
  readonly label: ReactNode;
  readonly disabled?: boolean;
  readonly className?: string;
  readonly describedBy?: string;
}): ReactElement {
  return (
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
}: {
  readonly value: T;
  readonly options: readonly SegmentedOption<T>[];
  readonly onChange: (next: T) => void;
  // The group's accessible name.
  readonly label: string;
  readonly className?: string;
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
  return (
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
}
