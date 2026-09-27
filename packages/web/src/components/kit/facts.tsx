import type { ReactElement, ReactNode } from "react";
import { cn } from "@/lib/utils";

// Facts about a thing, as a definition list: the label on the left in ink-2, the value on the
// right, one row each. The Documents theme detail and a stage's "Voice · Chunking" read this
// way, so a label heads its row instead of sitting in a sentence. Stacks on a phone.
export function Facts({
  className,
  label,
  children,
}: {
  readonly className?: string;
  // The list's accessible name, when the section around it does not give one.
  readonly label?: string;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <dl
      aria-label={label}
      className={cn(
        "m-0 grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-[max-content_minmax(0,1fr)] sm:gap-y-3",
        className,
      )}
    >
      {children}
    </dl>
  );
}

export function Fact({
  label,
  children,
}: {
  readonly label: ReactNode;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <>
      <dt className="text-small text-ink-2 max-sm:mt-2 max-sm:first:mt-0">{label}</dt>
      <dd className="m-0 min-w-0 text-body text-ink">{children}</dd>
    </>
  );
}
