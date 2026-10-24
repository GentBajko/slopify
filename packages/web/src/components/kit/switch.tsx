import { type KeyboardEvent, type ReactElement, type ReactNode, useId, useRef } from "react";
import type { HelpId } from "@/help/catalog";
import { cn } from "@/lib/utils";
import { HelpLine } from "./field.js";
import { helpScope, InfoTip } from "./info-tip.js";

// A control with its explanation: the info button after it, then the one visible sentence under
// it, both inside one help scope (help/coverage.ts). With neither, the control stands alone.
function Explained({
  control,
  tip,
  tipLabel,
  help,
  helpId,
  helpClassName,
}: {
  readonly control: ReactElement;
  readonly tip: HelpId | undefined;
  readonly tipLabel: string | undefined;
  readonly help: ReactNode;
  readonly helpId: string;
  readonly helpClassName?: string | undefined;
}): ReactElement {
  const tipped =
    tip === undefined ? (
      control
    ) : (
      <span
        className="inline-flex max-w-full items-center gap-1"
        {...(help === undefined ? helpScope : {})}
      >
        {control}
        <InfoTip id={tip} label={tipLabel} />
      </span>
    );
  if (help === undefined) return tipped;
  return (
    <div className="flex min-w-0 flex-col items-start gap-1" {...helpScope}>
      {tipped}
      <HelpLine id={helpId} className={helpClassName}>
        {help}
      </HelpLine>
    </div>
  );
}

// An on/off setting that applies at once. The label is part of the button, so the whole row
// toggles and the name is read with the state.
export function Switch({
  checked,
  onChange,
  label,
  disabled,
  className,
  describedBy,
  help,
  tip,
  tipLabel,
}: {
  readonly checked: boolean;
  readonly onChange: (next: boolean) => void;
  readonly label: ReactNode;
  readonly disabled?: boolean;
  readonly className?: string;
  readonly describedBy?: string;
  // One short sentence under the switch, lined up with its label: what turning it on does
  // ("Pauses the run so you can approve the images first."). Its explanation, visible.
  readonly help?: ReactNode;
  // The info button after the switch, only for a consequence that needs a paragraph;
  // `tipLabel` names it when `label` is not plain text.
  readonly tip?: HelpId;
  readonly tipLabel?: string;
}): ReactElement {
  const helpId = useId();
  const described =
    [describedBy, help === undefined ? undefined : helpId].filter(Boolean).join(" ") || undefined;
  const button = (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-describedby={described}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn("sl-switch", className)}
    >
      <span className="sl-switch__track" aria-hidden="true" />
      <span>{label}</span>
    </button>
  );
  return (
    <Explained
      control={button}
      tip={tip}
      tipLabel={tipLabel ?? (typeof label === "string" ? label : undefined)}
      help={help}
      helpId={helpId}
      helpClassName="sl-switch__help"
    />
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
  help,
  tip,
}: {
  readonly value: T;
  readonly options: readonly SegmentedOption<T>[];
  readonly onChange: (next: T) => void;
  // The group's accessible name.
  readonly label: string;
  readonly className?: string;
  // One short sentence under the group: what the choice changes. Its explanation, visible.
  readonly help?: ReactNode;
  // The info button after the group, only for a consequence that needs a paragraph.
  readonly tip?: HelpId;
}): ReactElement {
  const group = useRef<HTMLDivElement>(null);
  const helpId = useId();
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
      aria-describedby={help === undefined ? undefined : helpId}
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
  return <Explained control={segmented} tip={tip} tipLabel={label} help={help} helpId={helpId} />;
}
