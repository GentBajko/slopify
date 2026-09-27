import { createLink } from "@tanstack/react-router";
import type { ComponentProps, ReactElement } from "react";
import { cn } from "@/lib/utils";
import { type ButtonSize, buttonClass } from "./button.js";

// Links go somewhere, buttons do something (docs/design-system.md, Actions). A link wears a
// button's look only through the components here, and only when it is
//   - the main call to action of its item or area (New prompt, Open to continue, the fix a
//     Needs you item names), or
//   - one of a row of actions it sits in (a Library row's Edit and Duplicate, an editor's
//     Cancel beside Save).
// Any other navigation - Open, Calendar, See all patch notes - is a TextLink.
type LinkLook = "primary" | "secondary" | "quiet";

function ButtonAnchor({
  variant = "secondary",
  size = "default",
  className,
  ...props
}: ComponentProps<"a"> & {
  readonly variant?: LinkLook;
  readonly size?: ButtonSize;
}): ReactElement {
  return (
    <a
      data-slot="button-link"
      className={cn(buttonClass({ variant, size }), className)}
      {...props}
    />
  );
}

function TextAnchor({ className, ...props }: ComponentProps<"a">): ReactElement {
  return <a data-slot="text-link" className={cn("sl-link", className)} {...props} />;
}

// A router link with a button's look: `<ButtonLink to="/prompts/new" variant="primary">`.
export const ButtonLink = createLink(ButtonAnchor);

// A router link that reads as a link: `<TextLink to="/calendar">Calendar</TextLink>`.
export const TextLink = createLink(TextAnchor);

// A link to a file - a download, or a file opened in a new tab - that sits among the row's
// buttons and so wears their look: [Download PDF] [Open PDF].
export function FileLink({
  href,
  ...props
}: ComponentProps<"a"> & {
  readonly href: string;
  readonly variant?: LinkLook;
  readonly size?: ButtonSize;
}): ReactElement {
  return <ButtonAnchor href={href} {...props} />;
}
