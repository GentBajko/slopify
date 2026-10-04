import type { DatabaseSync } from "node:sqlite";
import { strFromU8, unzipSync } from "fflate";

// Studio's Advanced-mode export (Analytics → Advanced mode → Export → .csv): a zip holding
// "Table data.csv" (one row per video, the columns the person chose, with a Total row),
// "Chart data.csv" (each video's figure per day for the chart's metric) and "Totals.csv".
// Slopify keeps the latest one per channel and shows every column, so the videos can be
// compared without opening each one in Studio. Nothing here asks YouTube.

export type ColumnKind = "number" | "duration" | "text";

export interface ReportColumn {
  readonly label: string;
  readonly kind: ColumnKind;
}

export interface ReportRow {
  readonly videoId: string;
  readonly title: string;
  readonly published: string | null;
  // Seconds.
  readonly duration: number | null;
  // One value per metric column, in `columns` order; null where Studio left it empty.
  readonly values: readonly (number | string | null)[];
  // The chart's metric per day, oldest first, from the period's first day.
  readonly daily: readonly number[];
}

export interface StudioReport {
  readonly importedAt: string;
  // The view's own total per day (Totals.csv), on the chart's days; absent from imports made
  // before it was read, or when the zip had none.
  readonly dailyTotals?: readonly number[] | undefined;
  // The chart's metric ("Engaged views"), and the first and last day of the period.
  readonly chartMetric: string | null;
  readonly from: string | null;
  readonly to: string | null;
  readonly columns: readonly ReportColumn[];
  readonly totals: readonly (number | string | null)[];
  readonly rows: readonly ReportRow[];
}

export type ReportParse =
  | { readonly ok: true; readonly report: StudioReport }
  | { readonly ok: false; readonly message: string };

// RFC 4180: commas, quoted fields with "" for a quote, CRLF or LF lines.
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const body = text.replace(/^﻿/, "");
  for (let at = 0; at < body.length; at += 1) {
    const char = body[at];
    if (quoted) {
      if (char === '"' && body[at + 1] === '"') {
        field += '"';
        at += 1;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && body[at + 1] === "\n") at += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += char;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((one) => one.some((cell) => cell !== ""));
}

const durationPattern = /^(\d+):(\d{2})(?::(\d{2}))?$/;

function seconds(text: string): number | null {
  const match = durationPattern.exec(text.trim());
  if (match === null) return null;
  const [, a, b, c] = match;
  return c === undefined
    ? Number(a) * 60 + Number(b)
    : Number(a) * 3600 + Number(b) * 60 + Number(c);
}

function cell(text: string, kind: ColumnKind): number | string | null {
  const plain = text.trim();
  if (plain === "") return null;
  if (kind === "duration") return seconds(plain);
  if (kind === "number") {
    const value = Number(plain.replace(/,/g, ""));
    return Number.isFinite(value) ? value : null;
  }
  return plain;
}

// The columns before the metrics: Content (the video id), Video title, Video publish time and
// Duration. Studio names them in the account's language; their places are fixed.
const fixedColumns = 4;

export function parseStudioExport(bytes: Uint8Array, importedAt: string): ReportParse {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, { filter: (file) => file.name.toLowerCase().endsWith(".csv") });
  } catch {
    files = { "Table data.csv": bytes };
  }
  const named = (part: string) =>
    Object.entries(files).find(([name]) => name.toLowerCase().includes(part))?.[1];
  const tableBytes =
    named("table") ?? (Object.keys(files).length === 1 ? Object.values(files)[0] : undefined);
  if (tableBytes === undefined)
    return {
      ok: false,
      message:
        "That file has no table: export from Studio's Advanced mode (Analytics → Advanced mode → the Export arrow → Comma-separated values) and import the zip it downloads.",
    };
  const table = parseCsv(strFromU8(tableBytes));
  const header = table[0];
  if (header === undefined || header.length <= fixedColumns || table.length < 2)
    return {
      ok: false,
      message:
        "That table has no videos or no metrics. In Studio's Advanced mode, show the Content dimension with at least one metric, then export again.",
    };
  const body = table.slice(1);
  const totalRow = body.find((row) => /^total$/i.test((row[0] ?? "").trim()));
  const videoRows = body.filter(
    (row) => row !== totalRow && /^[A-Za-z0-9_-]{11}$/.test((row[0] ?? "").trim()),
  );
  const columns: ReportColumn[] = header.slice(fixedColumns).map((label, index) => {
    const samples = [totalRow, ...videoRows]
      .map((row) => (row?.[fixedColumns + index] ?? "").trim())
      .filter((value) => value !== "");
    const kind: ColumnKind =
      samples.length > 0 && samples.every((value) => durationPattern.test(value))
        ? "duration"
        : samples.every((value) => Number.isFinite(Number(value.replace(/,/g, ""))))
          ? "number"
          : "text";
    return { label: label.trim(), kind };
  });
  const valuesOf = (row: readonly string[]) =>
    columns.map((column, index) => cell(row[fixedColumns + index] ?? "", column.kind));

  // The chart: Date, Content, …, then the metric; one line per video per day.
  const chartBytes = named("chart");
  const chart = chartBytes === undefined ? [] : parseCsv(strFromU8(chartBytes));
  const chartMetric = chart[0]?.at(-1)?.trim() ?? null;
  const days = [...new Set(chart.slice(1).map((row) => row[0] ?? ""))].filter(Boolean).toSorted();
  const dayIndex = new Map(days.map((day, index) => [day, index]));
  const daily = new Map<string, number[]>();
  for (const row of chart.slice(1)) {
    const id = (row[1] ?? "").trim();
    const at = dayIndex.get(row[0] ?? "");
    if (at === undefined || id === "") continue;
    const series = daily.get(id) ?? Array.from({ length: days.length }, () => 0);
    series[at] = Number(row.at(-1)) || 0;
    daily.set(id, series);
  }
  // Totals.csv: Date, then the metric; the whole view's figure per day.
  const totalsBytes = named("totals");
  const totals = totalsBytes === undefined ? [] : parseCsv(strFromU8(totalsBytes)).slice(1);
  const dailyTotals = Array.from({ length: days.length }, () => 0);
  for (const row of totals) {
    const at = dayIndex.get(row[0] ?? "");
    if (at !== undefined) dailyTotals[at] = Number(row.at(-1)) || 0;
  }
  return {
    ok: true,
    report: {
      importedAt,
      ...(totals.length > 0 && days.length > 0 ? { dailyTotals } : {}),
      chartMetric: chart.length > 1 ? chartMetric : null,
      from: days[0] ?? null,
      to: days.at(-1) ?? null,
      columns,
      totals: totalRow === undefined ? columns.map(() => null) : valuesOf(totalRow),
      rows: videoRows.map((row) => {
        const id = (row[0] ?? "").trim();
        return {
          videoId: id,
          title: (row[1] ?? "").trim(),
          published: (row[2] ?? "").trim() || null,
          duration: (() => {
            const value = Number((row[3] ?? "").trim());
            return Number.isFinite(value) && (row[3] ?? "").trim() !== "" ? value : null;
          })(),
          values: valuesOf(row),
          daily: daily.get(id) ?? [],
        };
      }),
    },
  };
}

export function saveReport(db: DatabaseSync, channelId: string, report: StudioReport): void {
  db.prepare(
    `INSERT INTO studio_reports(channel_id, imported_at, report) VALUES (?,?,?)
     ON CONFLICT(channel_id) DO UPDATE SET imported_at=excluded.imported_at, report=excluded.report`,
  ).run(channelId, report.importedAt, JSON.stringify(report));
}

export function readReport(db: DatabaseSync, channelId: string): StudioReport | null {
  const row = db.prepare("SELECT report FROM studio_reports WHERE channel_id=?").get(channelId);
  if (row === undefined) return null;
  try {
    return JSON.parse(String(row.report)) as StudioReport;
  } catch {
    return null;
  }
}
