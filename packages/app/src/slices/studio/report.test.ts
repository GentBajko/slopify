import { strToU8, zipSync } from "fflate";
import { expect, it } from "vitest";
import { parseCsv, parseStudioExport } from "./report.js";

const table = [
  "Content,Video title,Video publish time,Duration,Views,Average view duration,Unique viewers,Thumbnail click-through rate (%)",
  "Total,,,,1500,0:20:00,0,4.5",
  'abcdefghijk,"The Lighthouse, Night One | Stories","Mar 9, 2025",3600,1000,0:25:10,,5.1',
  'lmnopqrstuv,The Harbour | Stories,"Apr 1, 2025",4200,500,1:02:03,,3.9',
].join("\n");
const chart = [
  "Date,Content,Video title,Video publish time,Duration,Views",
  "2025-03-09,abcdefghijk,x,x,3600,10",
  "2025-03-10,abcdefghijk,x,x,3600,30",
  "2025-03-10,lmnopqrstuv,x,x,4200,7",
].join("\n");

it("reads Studio's export zip: every column, the totals and each video's days", () => {
  const zip = zipSync({
    "Table data.csv": strToU8(table),
    "Chart data.csv": strToU8(chart),
    "Totals.csv": strToU8("Date,Views\n2025-03-09,10\n"),
  });
  const parsed = parseStudioExport(zip, "2026-10-03T00:00:00.000Z");
  if (!parsed.ok) throw new Error(parsed.message);
  const { report } = parsed;
  expect(report.columns).toEqual([
    { label: "Views", kind: "number" },
    { label: "Average view duration", kind: "duration" },
    { label: "Unique viewers", kind: "number" },
    { label: "Thumbnail click-through rate (%)", kind: "number" },
  ]);
  expect(report.totals).toEqual([1500, 1200, 0, 4.5]);
  expect(report.rows.map((row) => [row.videoId, row.title, row.duration, row.values])).toEqual([
    ["abcdefghijk", "The Lighthouse, Night One | Stories", 3600, [1000, 1510, null, 5.1]],
    ["lmnopqrstuv", "The Harbour | Stories", 4200, [500, 3723, null, 3.9]],
  ]);
  expect(report.chartMetric).toBe("Views");
  expect([report.from, report.to]).toEqual(["2025-03-09", "2025-03-10"]);
  expect(report.rows[0]?.daily).toEqual([10, 30]);
  // Totals.csv: the whole view per day, on the chart's days.
  expect(report.dailyTotals).toEqual([10, 0]);
  expect(report.rows[1]?.daily).toEqual([0, 7]);
});

it("takes the table as a bare CSV, and says what to export when it isn't one", () => {
  expect(parseStudioExport(strToU8(table), "now").ok).toBe(true);
  const wrong = parseStudioExport(strToU8("hello"), "now");
  expect(wrong.ok).toBe(false);
  expect(parseCsv('a,"b ""c"", d"\r\n1,2\n')).toEqual([
    ["a", 'b "c", d'],
    ["1", "2"],
  ]);
});
