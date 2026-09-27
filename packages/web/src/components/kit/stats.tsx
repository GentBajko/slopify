import type { ReactElement, ReactNode } from "react";
import { cn } from "@/lib/utils";

// Big numbers with their unit in the label: "$4.12" over "This run".
export function Stats({
  className,
  children,
}: {
  readonly className?: string;
  readonly children: ReactNode;
}): ReactElement {
  return <dl className={cn("sl-stats m-0", className)}>{children}</dl>;
}

export function Stat({
  value,
  label,
  children,
}: {
  readonly value: ReactNode;
  readonly label: ReactNode;
  // A meter or a note under the number.
  readonly children?: ReactNode;
}): ReactElement {
  return (
    <div className="sl-stat">
      <dt className="sl-stat__label order-2">{label}</dt>
      <dd className="sl-stat__value order-1 m-0">{value}</dd>
      {children === undefined ? null : <dd className="order-3 m-0 mt-1">{children}</dd>}
    </div>
  );
}

// A share of a limit. The label names what is measured, and the value text reads it in
// words ("18% of your weekly Codex limit").
export function Meter({
  value,
  label,
  valueText,
  tone = "accent",
  className,
}: {
  // 0..1
  readonly value: number;
  readonly label: string;
  readonly valueText?: string;
  readonly tone?: "accent" | "waiting";
  readonly className?: string;
}): ReactElement {
  const share = Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
  const percent = Math.round(share * 100);
  return (
    // biome-ignore lint/a11y/useSemanticElements: a native <meter> cannot be styled consistently across browsers; the ARIA meter carries the same semantics.
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      aria-valuetext={valueText ?? `${String(percent)}%`}
      className={cn("sl-meter", tone === "waiting" && "sl-meter--waiting", className)}
    >
      <span style={{ width: `${String(percent)}%` }} />
    </div>
  );
}

export interface Column<Row> {
  readonly id: string;
  readonly header: ReactNode;
  readonly cell: (row: Row) => ReactNode;
  // Right-aligned tabular figures.
  readonly numeric?: boolean;
}

// A plain table: uppercase condensed heads, hairline rows, numbers on the right.
export function DataTable<Row>({
  columns,
  rows,
  rowKey,
  caption,
  empty,
  className,
}: {
  readonly columns: readonly Column<Row>[];
  readonly rows: readonly Row[];
  readonly rowKey: (row: Row) => string;
  // Read by screen readers; visually hidden (the section head names the table).
  readonly caption: string;
  readonly empty?: ReactNode;
  readonly className?: string;
}): ReactElement {
  return (
    <table className={cn("sl-table", className)}>
      <caption className="sr-only">{caption}</caption>
      <thead>
        <tr>
          {columns.map((column) => (
            <th key={column.id} scope="col" className={column.numeric ? "num" : undefined}>
              {column.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 && empty !== undefined ? (
          <tr>
            <td colSpan={columns.length} className="text-ink-2">
              {empty}
            </td>
          </tr>
        ) : (
          rows.map((row) => (
            <tr key={rowKey(row)}>
              {columns.map((column) => (
                <td key={column.id} className={column.numeric ? "num" : undefined}>
                  {column.cell(row)}
                </td>
              ))}
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}
