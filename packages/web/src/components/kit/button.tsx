import { Slot } from "radix-ui";
import type { ComponentProps, ReactElement, ReactNode } from "react";
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
  // Renders the child element with the button's look, for the rare case a router link must
  // look like an action (the shell's New video). Links go somewhere; prefer a real button.
  readonly asChild?: boolean;
  // Why a disabled button is disabled, shown as its tooltip.
  readonly disabledReason?: string;
};

export function Button({
  variant = "secondary",
  size = "default",
  asChild = false,
  disabledReason,
  className,
  type,
  title,
  ...props
}: ButtonProps): ReactElement {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      {...(asChild ? {} : { type: type ?? "button" })}
      title={props.disabled && disabledReason !== undefined ? disabledReason : title}
      className={cn(buttonClass({ variant, size }), className)}
      {...props}
    />
  );
}

// An icon-only button. The label is required: it is the accessible name and the tooltip.
export function IconButton({
  label,
  children,
  ...props
}: Omit<ButtonProps, "variant" | "aria-label"> & {
  readonly label: string;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <Button variant="icon" aria-label={label} title={props.title ?? label} {...props}>
      {children}
    </Button>
  );
}

// The Play key: the primary button at its largest, used only to start runs.
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
