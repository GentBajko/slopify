import type { ReportRow, StudioReport } from "@app/slices/studio/report.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { UploadIcon } from "lucide-react";
import { type ReactElement, useRef, useState } from "react";
import type { Api } from "@/api";
import { useApp } from "@/app-context";
import { Button } from "@/components/kit/button";
import { Select } from "@/components/kit/field";
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

// The chart's metric per day as a small line: the whole period, scaled to the video's peak.
function Spark({ daily, label }: { readonly daily: readonly number[]; readonly label: string }) {
  const start = daily.findIndex((value) => value > 0);
  const days = start < 0 ? [] : daily.slice(start);
  if (days.length < 2) return <span className="text-ink-3">–</span>;
  const peak = Math.max(...days, 1);
  const width = 120;
  const height = 24;
  const points = days
    .map(
      (value, at) =>
        `${((at / (days.length - 1)) * width).toFixed(1)},${(height - (value / peak) * height).toFixed(1)}`,
    )
    .join(" ");
  return (
    <svg
      role="img"
      aria-label={label}
      width={width}
      height={height}
      viewBox={`0 0 ${String(width)} ${String(height)}`}
      className="block text-accent"
    >
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.25" />
    </svg>
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
                  <th scope="col">Video</th>
                  {report.chartMetric === null ? null : (
                    <th scope="col">{`${report.chartMetric} per day`}</th>
                  )}
                  {visible.map(({ column }) => (
                    <th key={column.label} scope="col" className="num">
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="font-semibold">
                  <td>Total</td>
                  {report.chartMetric === null ? null : <td />}
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
                      {report.chartMetric === null ? null : (
                        <td>
                          <Spark
                            daily={row.daily}
                            label={`${report.chartMetric} per day for ${row.title}`}
                          />
                        </td>
                      )}
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
        </>
      )}
    </section>
  );
}
