import { type ReactElement, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

// A line chart that can be read: values up the side with gridlines, labels along the bottom,
// a legend, and on hover a line through the day with every series' value at it. Drawn in SVG
// at the width it is given, no library.

export interface ChartSeries {
  readonly id: string;
  readonly label: string;
  readonly color: string;
  // One value per x position; null where the series has none (before its start).
  readonly values: readonly (number | null)[];
}

const plotHeight = 260;
const left = 56;
const right = 12;
const top = 12;
const bottom = 28;

// 1, 2 or 5 times a power of ten: the step that gives about `count` gridlines up to `max`.
function niceStep(max: number, count: number): number {
  const rough = max / count;
  const power = 10 ** Math.floor(Math.log10(rough));
  const unit = rough / power;
  return (unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 5 ? 5 : 10) * power;
}

export function LineChart({
  series,
  xLabels,
  formatValue,
  label,
  className,
}: {
  readonly series: readonly ChartSeries[];
  // One label per x position ("Mar 9" or "Day 12").
  readonly xLabels: readonly string[];
  readonly formatValue: (value: number) => string;
  // The chart's accessible name.
  readonly label: string;
  readonly className?: string;
}): ReactElement {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  const [hover, setHover] = useState<number | undefined>();
  useEffect(() => {
    const element = box.current;
    if (element === null || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry !== undefined) setWidth(Math.max(320, Math.round(entry.contentRect.width)));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const count = xLabels.length;
  const peak = Math.max(
    0,
    ...series.flatMap((one) => one.values.filter((value): value is number => value !== null)),
  );
  const step = niceStep(peak > 0 ? peak : 1, 4);
  const yMax = Math.max(step, Math.ceil((peak > 0 ? peak : 1) / step) * step);
  const plotWidth = width - left - right;
  const x = (at: number) => left + (count <= 1 ? 0 : (at / (count - 1)) * plotWidth);
  const y = (value: number) => top + plotHeight - (value / yMax) * plotHeight;
  const ticks = Array.from({ length: Math.round(yMax / step) + 1 }, (_, index) => index * step);
  const xTickCount = Math.min(count, Math.max(2, Math.floor(plotWidth / 90)));
  const xTicks = Array.from({ length: xTickCount }, (_, index) =>
    Math.round((index / Math.max(1, xTickCount - 1)) * (count - 1)),
  );
  const path = (values: readonly (number | null)[]) => {
    let d = "";
    let pen = false;
    values.forEach((value, at) => {
      if (value === null) {
        pen = false;
        return;
      }
      d += `${pen ? "L" : "M"}${x(at).toFixed(1)},${y(value).toFixed(1)}`;
      pen = true;
    });
    return d;
  };
  const height = top + plotHeight + bottom;
  const hovered =
    hover === undefined
      ? []
      : series
          .map((one) => ({ one, value: one.values[hover] ?? null }))
          .filter((entry): entry is { one: ChartSeries; value: number } => entry.value !== null)
          .toSorted((a, b) => b.value - a.value);
  return (
    <figure className={cn("m-0 flex flex-col gap-2", className)}>
      <div ref={box} className="relative w-full">
        <svg
          role="img"
          aria-label={label}
          width={width}
          height={height}
          viewBox={`0 0 ${String(width)} ${String(height)}`}
          className="block select-none"
          onMouseLeave={() => setHover(undefined)}
          onMouseMove={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            const at = Math.round(((event.clientX - rect.left - left) / plotWidth) * (count - 1));
            setHover(at < 0 || at >= count ? undefined : at);
          }}
        >
          {ticks.map((tick) => (
            <g key={tick}>
              <line
                x1={left}
                x2={width - right}
                y1={y(tick)}
                y2={y(tick)}
                stroke="currentColor"
                className="text-line"
                strokeWidth="1"
              />
              <text
                x={left - 8}
                y={y(tick)}
                textAnchor="end"
                dominantBaseline="middle"
                className="fill-ink-3 text-[11px]"
              >
                {formatValue(tick)}
              </text>
            </g>
          ))}
          {xTicks.map((at) => (
            <text
              key={at}
              x={x(at)}
              y={top + plotHeight + 18}
              textAnchor={at === 0 ? "start" : at === count - 1 ? "end" : "middle"}
              className="fill-ink-3 text-[11px]"
            >
              {xLabels[at]}
            </text>
          ))}
          {series.map((one) => (
            <path
              key={one.id}
              d={path(one.values)}
              fill="none"
              stroke={one.color}
              strokeWidth="1.75"
              strokeLinejoin="round"
            />
          ))}
          {hover === undefined ? null : (
            <g>
              <line
                x1={x(hover)}
                x2={x(hover)}
                y1={top}
                y2={top + plotHeight}
                stroke="currentColor"
                className="text-ink-3"
                strokeDasharray="3 3"
              />
              {hovered.map(({ one, value }) => (
                <circle key={one.id} cx={x(hover)} cy={y(value)} r="3.5" fill={one.color} />
              ))}
            </g>
          )}
        </svg>
        {hover === undefined || hovered.length === 0 ? null : (
          <div
            className="pointer-events-none absolute top-2 z-10 w-[340px] rounded-control border border-line bg-surface p-2 text-small shadow-md"
            style={
              x(hover) > width / 2 ? { right: width - x(hover) + 12 } : { left: x(hover) + 12 }
            }
          >
            <div className="mb-1 font-semibold">{xLabels[hover]}</div>
            {hovered.map(({ one, value }) => (
              <div key={one.id} className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="inline-block size-2 shrink-0 rounded-full"
                  style={{ background: one.color }}
                />
                <span className="min-w-0 flex-1 truncate">{one.label}</span>
                <span className="tabular-nums">{formatValue(value)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <figcaption className="flex flex-wrap gap-x-4 gap-y-1 text-small text-ink-2">
        {series.map((one) => (
          <span key={one.id} className="flex max-w-[320px] items-center gap-2">
            <span
              aria-hidden="true"
              className="inline-block h-[3px] w-4 shrink-0 rounded"
              style={{ background: one.color }}
            />
            <span className="truncate">{one.label}</span>
          </span>
        ))}
      </figcaption>
    </figure>
  );
}
