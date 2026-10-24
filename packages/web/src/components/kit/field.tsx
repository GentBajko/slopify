import {
  type ComponentProps,
  type CSSProperties,
  createContext,
  type ReactElement,
  type ReactNode,
  useContext,
  useId,
} from "react";
import type { HelpId } from "@/help/catalog";
import { cn } from "@/lib/utils";
import { helpScope, InfoTip } from "./info-tip.js";

// One short visible sentence under a control, saying what its label cannot ("About 150 words
// is one minute."). The screen walks (help/coverage.ts) count it as the control's explanation
// when it sits inside the same `helpScope`. Inside a Field, pass `help` instead; a row that
// lays out its own control spreads `helpScope` on the row and puts this line in it.
export function HelpLine({
  id,
  className,
  children,
}: {
  readonly id?: string | undefined;
  readonly className?: string | undefined;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <p id={id} className={cn("sl-help m-0", className)} data-help-text="">
      {children}
    </p>
  );
}

// A label above its control, one short help line, and the error in words under it. The
// control inside picks up its id, `aria-describedby` and `aria-invalid` from the field, so a
// caller never wires them by hand.
interface FieldWiring {
  readonly id: string;
  readonly describedBy: string | undefined;
  readonly invalid: boolean;
}

const FieldContext = createContext<FieldWiring | undefined>(undefined);

export function useField(): FieldWiring | undefined {
  return useContext(FieldContext);
}

export function Field({
  label,
  help,
  error,
  tip,
  tipLabel,
  id,
  className,
  children,
}: {
  readonly label: ReactNode;
  // One short sentence under the control that says what the label cannot: the field's
  // explanation (help/coverage.ts), visible without a click.
  readonly help?: ReactNode;
  // The info button beside the label, only for a setting whose consequence (a cost, a limit,
  // a side effect) needs a paragraph.
  readonly tip?: HelpId;
  // "About {tipLabel}" when the label is not plain text.
  readonly tipLabel?: string;
  // Say what failed, why, and what fixes it.
  readonly error?: ReactNode;
  readonly id?: string;
  readonly className?: string;
  readonly children: ReactNode;
}): ReactElement {
  const generated = useId();
  const controlId = id ?? `field-${generated}`;
  const helpId = help === undefined ? undefined : `${controlId}-help`;
  const errorId = error === undefined || error === null ? undefined : `${controlId}-error`;
  const describedBy = [helpId, errorId].filter(Boolean).join(" ") || undefined;
  return (
    <FieldContext.Provider value={{ id: controlId, describedBy, invalid: errorId !== undefined }}>
      <div className={cn("sl-field", className)} data-slot="field" {...helpScope}>
        {tip === undefined ? (
          <label className="sl-field__label" htmlFor={controlId}>
            {label}
          </label>
        ) : (
          <div className="flex min-w-0 items-center gap-1">
            <label className="sl-field__label" htmlFor={controlId}>
              {label}
            </label>
            <InfoTip
              id={tip}
              label={tipLabel ?? (typeof label === "string" ? label : undefined)}
              className="-my-1"
            />
          </div>
        )}
        {children}
        {helpId === undefined ? null : (
          <HelpLine id={helpId} className="sl-field__help">
            {help}
          </HelpLine>
        )}
        {errorId === undefined ? null : (
          <p id={errorId} className="sl-field__error m-0">
            {error}
          </p>
        )}
      </div>
    </FieldContext.Provider>
  );
}

interface Wirable {
  id?: string | undefined;
  "aria-describedby"?: string | undefined;
  "aria-invalid"?: boolean | "true" | "false" | "grammar" | "spelling" | undefined;
}

function wired<P extends Wirable>(field: FieldWiring | undefined, props: P): P {
  if (field === undefined) return props;
  const describedBy =
    [field.describedBy, props["aria-describedby"]].filter(Boolean).join(" ") || undefined;
  return {
    ...props,
    id: props.id ?? field.id,
    "aria-describedby": describedBy,
    "aria-invalid": props["aria-invalid"] ?? (field.invalid ? true : undefined),
  };
}

export function Input({ className, ...props }: ComponentProps<"input">): ReactElement {
  const field = useField();
  return <input className={cn("sl-input", className)} {...wired(field, props)} />;
}

// A native checkbox in the app's accent; the label stays the caller's, so it keeps its own
// `htmlFor`, `disabled` and focus ring.
export function Checkbox({
  className,
  ...props
}: Omit<ComponentProps<"input">, "type">): ReactElement {
  return <input type="checkbox" className={cn("size-4 accent-accent", className)} {...props} />;
}

// Grows with its text (see `.sl-textarea`); `rows` stays the height it starts at.
export function Textarea({ className, style, ...props }: ComponentProps<"textarea">): ReactElement {
  const field = useField();
  const rows = { "--sl-rows": props.rows ?? 4 } as CSSProperties;
  return (
    <textarea
      className={cn("sl-textarea", className)}
      style={{ ...rows, ...style }}
      {...wired(field, props)}
    />
  );
}

// A native select: the platform's own list, keyboard and screen-reader behaviour.
export function Select({
  className,
  options,
  children,
  ...props
}: ComponentProps<"select"> & {
  readonly options?: readonly { readonly value: string; readonly label: string }[];
}): ReactElement {
  const field = useField();
  return (
    <select className={cn("sl-select", className)} {...wired(field, props)}>
      {options?.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
      {children}
    </select>
  );
}

// Keywords, commands and paths: `{{Topic}}`, `codex login`.
export function Code({ className, ...props }: ComponentProps<"code">): ReactElement {
  return <code className={cn("sl-code", className)} {...props} />;
}
