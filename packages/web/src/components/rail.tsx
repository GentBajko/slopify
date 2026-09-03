import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// Rails are bordered rows sharing edges, not cards; elevation belongs to dialogs alone. Radius
// 6 on the group, none on the rows.
export function RailGroup({
  children,
  className,
}: {
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <div className={cn("overflow-hidden rounded-panel border border-line bg-panel", className)}>
      {children}
    </div>
  );
}

export function Rail({
  children,
  className,
}: {
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <div
      className={cn(
        "relative flex items-center gap-[14px] border-b border-line px-4 py-[14px] last:border-b-0",
        className,
      )}
    >
      {children}
    </div>
  );
}

// The thin progress meter under a running rail.
export function RailMeter({
  current,
  total,
}: {
  readonly current: number;
  readonly total: number;
}) {
  const share = total <= 0 ? 0 : Math.min(1, Math.max(0, current / total));
  return (
    <span
      aria-hidden="true"
      data-slot="rail-meter"
      className="absolute inset-x-0 bottom-0 h-[2px] bg-lamp-run transition-[width] duration-[250ms] ease-out motion-reduce:transition-none"
      style={{ width: `${String(Math.round(share * 100))}%` }}
    />
  );
}
