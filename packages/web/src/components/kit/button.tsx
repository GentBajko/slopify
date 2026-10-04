import { Slot } from "radix-ui";
import { type ComponentProps, type ReactElement, type ReactNode, useId } from "react";
import { cn } from "@/lib/utils";

// The five button kinds, one meaning each (docs/design-system.md, Actions):
// primary is the one thing to do next in an area, secondary any other real action, quiet a
// low-stakes or repeated one, destructive deletes or discards (and confirms first), icon is a
// quiet button with only an icon and always an `aria-label`. Name each for its result.
export type ButtonVariant = "primary" | "secondary" | "quiet" | "destructive" | "icon";
export type ButtonSize = "default" | "small";

export function buttonClass({
  variant = "secondary",
  size = "default",
}: {
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
} = {}): string {
  return cn("sl-btn", `sl-btn--${variant}`, size === "small" && "sl-btn--small");
}

export type ButtonProps = ComponentProps<"button"> & {
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  // Why a disabled button is disabled, as its tooltip.
  readonly disabledReason?: string | undefined;
  // For a reason the person needs in order to go on ("Cancel the run first, then delete
  // it."), not a passing "Saving…": the disabled button stays in the tab order
  // (`aria-disabled`, presses refused here), the reason is its description, and the kit's
  // tooltip shows it on hover and on keyboard focus. A native `disabled` button can be
  // neither focused nor described to a keyboard user.
  readonly focusableWhenDisabled?: boolean;
};

export function Button({
  variant = "secondary",
  size = "default",
  disabledReason,
  focusableWhenDisabled = false,
  className,
  type,
  title,
  disabled,
  onClick,
  children,
  ...props
}: ButtonProps): ReactElement {
  const reasonId = useId();
  const classes = cn(buttonClass({ variant, size }), className);
  const reason = disabled === true && disabledReason !== "" ? disabledReason : undefined;
  if (reason === undefined || !focusableWhenDisabled)
    return (
      <button
        data-slot="button"
        data-variant={variant}
        type={type ?? "button"}
        title={reason ?? title}
        disabled={disabled}
        onClick={onClick}
        className={classes}
        {...props}
      >
        {children}
      </button>
    );
  // Preventing the click also keeps a submit button from sending its form.
  const describedBy = [props["aria-describedby"], reasonId].filter(Boolean).join(" ");
  return (
    <button
      data-slot="button"
      data-variant={variant}
      type={type ?? "button"}
      className={classes}
      {...props}
      aria-disabled="true"
      aria-describedby={describedBy}
      data-tip={reason}
      data-reason=""
      onClick={(event) => event.preventDefault()}
      onPointerDown={(event) => event.preventDefault()}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") event.preventDefault();
      }}
    >
      {children}
      <span id={reasonId} hidden>
        {reason}
      </span>
    </button>
  );
}

// An icon-only button. The label is required: it is the accessible name and the tooltip,
// drawn by the kit (`data-tip`) at once on hover and on keyboard focus (a browser's `title`
// shows on hover only). `tip` gives shorter words for the tooltip; `tip={false}` falls back
// to the browser's title where the kit's tooltip would be cut off by its container.
export function IconButton({
  label,
  tip,
  title,
  children,
  ...props
}: Omit<ButtonProps, "variant" | "aria-label"> & {
  readonly label: string;
  readonly tip?: boolean | string;
  readonly children: ReactNode;
}): ReactElement {
  const shown = tip === false ? undefined : typeof tip === "string" ? tip : label;
  return (
    <Button
      variant="icon"
      aria-label={label}
      {...(shown === undefined ? { title: title ?? label } : { "data-tip": shown })}
      {...props}
    >
      {children}
    </Button>
  );
}

// The Play key: the primary button at its largest, used only to start runs. `asChild` is for
// the shell's New project, the one link that opens the run setup and so wears the key.
export function PlayKey({
  className,
  asChild = false,
  type,
  ...props
}: ComponentProps<"button"> & { readonly asChild?: boolean }): ReactElement {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      data-slot="play-key"
      {...(asChild ? {} : { type: type ?? "button" })}
      className={cn("sl-key", className)}
      {...props}
    />
  );
}

// Buttons in a group: section-head actions, dialog feet. Order: primary, secondary, quiet,
// then an overflow for rare actions.
export function ButtonRow({ className, ...props }: ComponentProps<"div">): ReactElement {
  return <div className={cn("sl-btn-row", className)} {...props} />;
}
