import type { ReportRow, StudioReport } from "@app/slices/studio/report.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { UploadIcon } from "lucide-react";
import { type ReactElement, useRef, useState } from "react";
import type { Api } from "@/api";
import { useApp } from "@/app-context";
import { Button } from "@/components/kit/button";
import { Select } from "@/components/kit/field";
import { LineChart } from "@/components/kit/line-chart";
import { SectionHead } from "@/components/kit/section-head";
import { useToast } from "@/components/kit/toast";
import { read } from "@/http";

// Channels → YouTube numbers → From Studio: Studio's Advanced-mode export (the zip its Export
// arrow downloads), every video as a row and every metric the person chose in Studio as a
// column, with each video's daily figure for the chart's metric as a small line. Columns Studio
// left empty for every video start hidden; the person picks the rest and the order.

interface ReportBody {
  readonly report: StudioReport | null;
  readonly projects: Readonly<
    Record<
      string,
      { readonly projectId: string; readonly short: number | null; readonly projectTitle: string }
    >
  >;
}

const reportUrl = (api: Api, channelId: string) =>
  `${api.origin}/api/studio/channels/${channelId}/report`;

async function readStudioReport(api: Api, channelId: string): Promise<ReportBody> {
  return read(await api.fetch(reportUrl(api, channelId)));
}

async function importStudioReport(api: Api, channelId: string, file: File): Promise<ReportBody> {
  return read(
    await api.fetch(reportUrl(api, channelId), {
      method: "POST",
      headers: { "content-type": file.type || "application/zip" },
      body: file,
    }),
  );
}

function shown(value: number | string | null, kind: string, label: string): string {
  if (value === null) return "–";
  if (typeof value === "string") return value;
  if (kind === "duration") {
    const hours = Math.floor(value / 3600);
    const minutes = Math.floor((value % 3600) / 60);
    const seconds = String(Math.round(value % 60)).padStart(2, "0");
    return hours > 0
      ? `${String(hours)}:${String(minutes).padStart(2, "0")}:${seconds}`
      : `${String(minutes)}:${seconds}`;
  }
  const decimals = /%|\(|rpm|revenue|hours/i.test(label) && !Number.isInteger(value) ? 1 : 0;
  return value.toLocaleString("en", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

// Distinct, readable on light and dark: one per compared video.
const palette = [
  "#7cb342",
  "#42a5f5",
  "#ef6c00",
  "#ab47bc",
  "#26a69a",
  "#ec407a",
  "#fdd835",
  "#8d6e63",
  "#5c6bc0",
  "#78909c",
];

type Shape = "daily" | "average" | "total";
type Timeline = "dates" | "since";
type Range = "all" | "90" | "30";

const dayLabel = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" });
const yearLabel = new Intl.DateTimeFormat(undefined, { month: "short", year: "numeric" });

function shaped(values: readonly number[], shape: Shape): number[] {
  if (shape === "total") {
    let sum = 0;
    return values.map((value) => (sum += value));
  }
  if (shape === "average")
    return values.map((_, at) => {
      const window = values.slice(Math.max(0, at - 6), at + 1);
      return window.reduce((sum, value) => sum + value, 0) / window.length;
    });
  return [...values];
}

function TrendChart({
  report,
  rows,
  picked,
  colorOf,
  shape,
  setShape,
  timeline,
  setTimeline,
  range,
  setRange,
}: {
  readonly report: StudioReport;
  readonly rows: readonly ReportRow[];
  readonly picked: readonly string[];
  readonly colorOf: (videoId: string) => string;
  readonly shape: Shape;
  readonly setShape: (next: Shape) => void;
  readonly timeline: Timeline;
  readonly setTimeline: (next: Timeline) => void;
  readonly range: Range;
  readonly setRange: (next: Range) => void;
}): ReactElement {
  const metric = report.chartMetric ?? "Views";
  const chosen = rows.filter((row) => picked.includes(row.videoId));
  const from = report.from === null ? new Date() : new Date(`${report.from}T00:00:00`);
  const dayCount = Math.max(0, ...rows.map((row) => row.daily.length));
  let xLabels: string[];
  let series: { id: string; label: string; color: string; values: (number | null)[] }[];
  if (timeline === "dates") {
    const first = range === "all" ? 0 : Math.max(0, dayCount - Number(range));
    const spansYears = dayCount - first > 200;
    xLabels = Array.from({ length: dayCount - first }, (_, index) => {
      const day = new Date(from);
      day.setDate(day.getDate() + first + index);
      return (spansYears ? yearLabel : dayLabel).format(day);
    });
    series = chosen.map((row) => {
      const start = row.daily.findIndex((value) => value > 0);
      const values: (number | null)[] = shaped(row.daily, shape).map((value, at) =>
        start < 0 || at < start ? null : value,
      );
      return {
        id: row.videoId,
        label: row.title,
        color: colorOf(row.videoId),
        values: values.slice(first),
      };
    });
  } else {
    const longest = Math.max(
      1,
      ...chosen.map((row) => {
        const start = row.daily.findIndex((value) => value > 0);
        return start < 0 ? 0 : row.daily.length - start;
      }),
    );
    const span = range === "all" ? longest : Math.min(longest, Number(range));
    xLabels = Array.from({ length: span }, (_, index) => `Day ${String(index + 1)}`);
    series = chosen.map((row) => {
      const start = Math.max(
        0,
        row.daily.findIndex((value) => value > 0),
      );
      const values = shaped(row.daily.slice(start), shape).slice(0, span);
      return {
        id: row.videoId,
        label: row.title,
        color: colorOf(row.videoId),
        values: Array.from({ length: span }, (_, at) => values[at] ?? null),
      };
    });
  }
  const what =
    shape === "daily"
      ? `${metric} per day`
      : shape === "average"
        ? `${metric} per day, 7-day average`
        : `${metric}, running total`;
  return (
    <section aria-label="Over time" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-semibold">{what}</span>
        <span className="flex-1" />
        <Select
          aria-label="Show"
          className="w-[200px]"
          value={shape}
          onChange={(event) => setShape(event.currentTarget.value as Shape)}
          options={[
            { value: "average", label: "7-day average" },
            { value: "daily", label: "Per day" },
            { value: "total", label: "Running total" },
          ]}
        />
        <Select
          aria-label="Timeline"
          className="w-[220px]"
          value={timeline}
          onChange={(event) => setTimeline(event.currentTarget.value as Timeline)}
          options={[
            { value: "dates", label: "By date" },
            { value: "since", label: "Days since release" },
          ]}
        />
        <Select
          aria-label="Period"
          className="w-[170px]"
          value={range}
          onChange={(event) => setRange(event.currentTarget.value as Range)}
          options={[
            { value: "all", label: timeline === "dates" ? "All time" : "Whole life" },
            { value: "90", label: timeline === "dates" ? "Last 90 days" : "First 90 days" },
            { value: "30", label: timeline === "dates" ? "Last 30 days" : "First 30 days" },
          ]}
        />
      </div>
      {chosen.length === 0 ? (
        <p className="m-0 text-small text-ink-3">
          Tick videos in the Chart column below to compare them here.
        </p>
      ) : (
        <LineChart
          series={series}
          xLabels={xLabels}
          label={`${what} for ${String(chosen.length)} videos`}
          formatValue={compact}
        />
      )}
    </section>
  );
}

const compact = (value: number) =>
  value >= 10_000
    ? `${(value / 1000).toFixed(value >= 100_000 ? 0 : 1)}k`
    : Math.round(value).toLocaleString("en");

// One chart per video, from its first day on YouTube: its own scale, dates along the bottom,
// the value on hover, under its title and total.
function EachVideo({
  report,
  rows,
  shape,
  range,
  colorOf,
}: {
  readonly report: StudioReport;
  readonly rows: readonly ReportRow[];
  readonly shape: Shape;
  readonly range: Range;
  readonly colorOf: (videoId: string) => string;
}): ReactElement {
  const metric = report.chartMetric ?? "Views";
  const from = report.from === null ? new Date() : new Date(`${report.from}T00:00:00`);
  return (
    <section aria-label="Each video" className="flex flex-col gap-3">
      <span className="font-semibold">{`Each video · ${metric}`}</span>
      {rows.some((row) => !row.daily.some((value) => value > 0)) ? (
        <p className="m-0 text-small text-ink-3">
          Studio's export holds daily figures only for the videos drawn in its own chart. To chart
          more, tick them in Advanced mode's chart before you export.
        </p>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-2">
        {rows.map((row) => {
          const start = row.daily.findIndex((value) => value > 0);
          if (start < 0) return null;
          const all = shaped(row.daily.slice(start), shape);
          const first = range === "all" ? 0 : Math.max(0, all.length - Number(range));
          const values = all.slice(first);
          const labels = values.map((_, at) => {
            const day = new Date(from);
            day.setDate(day.getDate() + start + first + at);
            return (values.length > 200 ? yearLabel : dayLabel).format(day);
          });
          const total = row.daily.reduce((sum, value) => sum + value, 0);
          return (
            <div key={row.videoId} className="flex min-w-0 flex-col gap-1">
              <div className="flex items-baseline gap-2">
                <span
                  aria-hidden="true"
                  className="inline-block size-2.5 shrink-0 rounded-full"
                  style={{ background: colorOf(row.videoId) }}
                />
                <span className="min-w-0 flex-1 truncate font-semibold" title={row.title}>
                  {row.title}
                </span>
                <span className="text-small text-ink-3">{`${total.toLocaleString("en")} total`}</span>
              </div>
              <LineChart
                height={150}
                legend={false}
                label={`${metric} for ${row.title}`}
                xLabels={labels}
                formatValue={compact}
                series={[
                  { id: row.videoId, label: row.title, color: colorOf(row.videoId), values },
                ]}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}

const hiddenKey = (channelId: string) => `slopify.studioReport.hidden.${channelId}`;

function storedHidden(channelId: string): readonly string[] | undefined {
  try {
    const stored = window.localStorage.getItem(hiddenKey(channelId));
    return stored === null ? undefined : (JSON.parse(stored) as string[]);
  } catch {
    return undefined;
  }
}

export function StudioReportSection({ channelId }: { readonly channelId: string }): ReactElement {
  const { api } = useApp();
  const client = useQueryClient();
  const notify = useToast();
  const file = useRef<HTMLInputElement>(null);
  const key = ["studio", "report", channelId] as const;
  const body = useQuery({ queryKey: key, queryFn: () => readStudioReport(api, channelId) });
  const [sort, setSort] = useState<number>(0);
  const [pickedChoice, setPicked] = useState<readonly string[] | undefined>();
  const [shape, setShape] = useState<Shape>("average");
  const [timeline, setTimeline] = useState<Timeline>("dates");
  const [range, setRange] = useState<Range>("all");
  const [hiddenChoice, setHidden] = useState<readonly string[] | undefined>(() =>
    storedHidden(channelId),
  );
  const take = useMutation({
    mutationFn: (picked: File) => importStudioReport(api, channelId, picked),
    onSuccess: (answer) => {
      client.setQueryData(key, answer);
      notify(
        `Imported ${String(answer.report?.rows.length ?? 0)} videos from Studio's export.`,
        "success",
      );
    },
    onError: (error: Error) => notify(`The export wasn't imported: ${error.message}`, "error"),
  });
  const report = body.data?.report ?? null;
  const columns = report?.columns ?? [];
  // Columns Studio left empty for every video start hidden.
  const emptyByDefault = columns
    .filter((_, index) => (report?.rows ?? []).every((row) => row.values[index] === null))
    .map((column) => column.label);
  const hidden = hiddenChoice ?? emptyByDefault;
  const setHiddenKept = (next: readonly string[]) => {
    setHidden(next);
    try {
      window.localStorage.setItem(hiddenKey(channelId), JSON.stringify(next));
    } catch {
      // Not kept in this browser; the choice lasts for this page.
    }
  };
  const visible = columns
    .map((column, index) => ({ column, index }))
    .filter(({ column }) => !hidden.includes(column.label));
  const value = (row: ReportRow, index: number) => {
    const one = row.values[index];
    return typeof one === "number" ? one : -1;
  };
  const rows = [...(report?.rows ?? [])].toSorted(
    (left, right) => value(right, sort) - value(left, sort),
  );
  // The five with the most of the chart's metric are compared until the person picks.
  const byChart = [...(report?.rows ?? [])].toSorted(
    (left, right) =>
      right.daily.reduce((sum, one) => sum + one, 0) -
      left.daily.reduce((sum, one) => sum + one, 0),
  );
  const picked = pickedChoice ?? byChart.slice(0, 5).map((row) => row.videoId);
  const colorOf = (videoId: string) => {
    const at = (report?.rows ?? []).findIndex((row) => row.videoId === videoId);
    return palette[(at < 0 ? 0 : at) % palette.length] ?? "#7cb342";
  };
  return (
    <section aria-label="From Studio" className="flex flex-col gap-3">
      <SectionHead
        as="h3"
        title="From Studio's export"
        meta={
          report === null
            ? undefined
            : `${String(report.rows.length)} videos · ${report.from ?? "?"} to ${report.to ?? "?"} · imported ${new Date(report.importedAt).toLocaleDateString()}`
        }
      >
        <input
          ref={file}
          type="file"
          accept=".zip,.csv,application/zip,text/csv"
          hidden
          aria-label="Studio export file"
          onChange={(event) => {
            const picked = event.currentTarget.files?.[0];
            if (picked !== undefined) take.mutate(picked);
            event.currentTarget.value = "";
          }}
        />
        <Button
          type="button"
          variant="secondary"
          disabled={take.isPending}
          onClick={() => file.current?.click()}
        >
          <UploadIcon aria-hidden="true" strokeWidth={1.75} />
          {take.isPending ? "Importing…" : "Import from Studio"}
        </Button>
      </SectionHead>
      <p className="m-0 text-small text-ink-2">
        In YouTube Studio, open Analytics → Advanced mode, choose the metrics as columns, press the
        Export arrow → Comma-separated values, and import the zip it downloads here. Every column
        comes along; a new import replaces the old one.
      </p>
      {report === null ? null : (
        <>
          {report.chartMetric === null ? null : (
            <TrendChart
              report={report}
              rows={rows}
              picked={picked}
              colorOf={colorOf}
              shape={shape}
              setShape={setShape}
              timeline={timeline}
              setTimeline={setTimeline}
              range={range}
              setRange={setRange}
            />
          )}
          <div className="flex flex-wrap items-center gap-3">
            <Select
              aria-label="Order by"
              className="w-[280px]"
              value={String(sort)}
              onChange={(event) => setSort(Number(event.currentTarget.value))}
              options={columns.map((column, index) => ({
                value: String(index),
                label: `Most ${column.label}`,
              }))}
            />
            <details className="text-small">
              <summary className="cursor-pointer text-ink-2">
                Columns ({String(visible.length)} of {String(columns.length)})
              </summary>
              <div className="mt-2 grid grid-cols-2 gap-1 sm:grid-cols-3">
                {columns.map((column) => (
                  <label key={column.label} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={!hidden.includes(column.label)}
                      onChange={(event) =>
                        setHiddenKept(
                          event.currentTarget.checked
                            ? hidden.filter((one) => one !== column.label)
                            : [...hidden, column.label],
                        )
                      }
                    />
                    {column.label}
                  </label>
                ))}
              </div>
            </details>
          </div>
          <div className="overflow-x-auto">
            <table className="sl-table [&_td]:px-3 [&_th]:px-3 [&_td.num]:whitespace-nowrap">
              <caption className="sr-only">Studio's numbers for every video</caption>
              <thead>
                <tr>
                  {report.chartMetric === null ? null : <th scope="col">Chart</th>}
                  <th scope="col">Video</th>
                  {visible.map(({ column }) => (
                    <th key={column.label} scope="col" className="num">
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="font-semibold">
                  {report.chartMetric === null ? null : <td />}
                  <td>Total</td>
                  {visible.map(({ column, index }) => (
                    <td key={column.label} className="num">
                      {shown(report.totals[index] ?? null, column.kind, column.label)}
                    </td>
                  ))}
                </tr>
                {rows.map((row) => {
                  const project = body.data?.projects[row.videoId];
                  return (
                    <tr key={row.videoId}>
                      {report.chartMetric === null ? null : (
                        <td>
                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              disabled={!row.daily.some((value) => value > 0)}
                              aria-label={`Compare ${row.title} in the chart`}
                              checked={picked.includes(row.videoId)}
                              onChange={(event) =>
                                setPicked(
                                  event.currentTarget.checked
                                    ? [...picked, row.videoId]
                                    : picked.filter((one) => one !== row.videoId),
                                )
                              }
                            />
                            <span
                              aria-hidden="true"
                              className="inline-block size-2.5 rounded-full"
                              style={{
                                background: picked.includes(row.videoId)
                                  ? colorOf(row.videoId)
                                  : "transparent",
                              }}
                            />
                          </label>
                        </td>
                      )}
                      <td className="max-w-[320px]">
                        {project === undefined ? (
                          <span className="block truncate" title={row.title}>
                            {row.title}
                          </span>
                        ) : (
                          <Link
                            to="/projects/$projectId"
                            params={{ projectId: project.projectId }}
                            className="block truncate"
                            title={row.title}
                          >
                            {row.title}
                          </Link>
                        )}
                        <span className="text-label text-ink-3">{row.published ?? ""}</span>
                      </td>
                      {visible.map(({ column, index }) => (
                        <td key={column.label} className="num">
                          {shown(row.values[index] ?? null, column.kind, column.label)}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {report.chartMetric === null ? null : (
            <EachVideo report={report} rows={rows} shape={shape} range={range} colorOf={colorOf} />
          )}
        </>
      )}
    </section>
  );
}
