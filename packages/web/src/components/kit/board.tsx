import type { ReactElement, ReactNode } from "react";
import { cn } from "@/lib/utils";

// The third page shape (docs/design-system.md, Layout): a full-width grid of columns for the
// screens that are an overview rather than one thing, such as Home and the calendar. Each
// column is a stack of sections separated by space, never boxed; below 1024px the columns
// stack in their order.
//
// `split` says how the width is shared:
//   "main-side"  the home screen: a wider main column and a narrower one (1.35 : 1)
//   "aside"      a working area beside a fixed 360px panel (the calendar's suggestions)
//   "even"       columns of equal width, as many as are given
export type BoardSplit = "main-side" | "aside" | "even";

export function Board({
  split = "main-side",
  className,
  children,
}: {
  readonly split?: BoardSplit;
  readonly className?: string;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <div data-slot="board" className={cn("sl-board", `sl-board--${split}`, className)}>
      {children}
    </div>
  );
}

// One column of a board. With a label it is a named region (a `section`, or an `aside` for a
// panel that supports the main column); without one it is a plain column.
export function BoardColumn({
  as = "div",
  label,
  className,
  children,
}: {
  readonly as?: "div" | "aside";
  readonly label?: string;
  readonly className?: string;
  readonly children: ReactNode;
}): ReactElement {
  const classes = cn("sl-board__column", className);
  if (as === "aside")
    return (
      <aside aria-label={label} className={classes}>
        {children}
      </aside>
    );
  return label === undefined ? (
    <div className={classes}>{children}</div>
  ) : (
    <section aria-label={label} className={classes}>
      {children}
    </section>
  );
}
