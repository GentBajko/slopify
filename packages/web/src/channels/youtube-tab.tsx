import type {
  PerformanceProject,
  PerformanceRow,
  PerformanceTotals,
} from "@app/slices/studio/performance.js";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { type ReactElement, useState } from "react";
import { readChannelPerformance } from "@/api";
import { useApp } from "@/app-context";
import { EmptyState } from "@/components/kit/empty-state";
import { Select } from "@/components/kit/field";
import { SectionHead } from "@/components/kit/section-head";
import { type Column, DataTable, Stat, Stats } from "@/components/kit/stats";

// Channels → YouTube numbers: the channel's long videos and shorts on YouTube with Studio's
// numbers as the Slopify Studio extension last read them (daily, or Read Studio numbers now in
// its popup): totals first, then every video with its shorts under it.

const whole = (value: number | null | undefined) =>
  value === null || value === undefined ? "–" : Math.round(value).toLocaleString("en");
const percent = (value: number | null | undefined) =>
  value === null || value === undefined ? "–" : `${value.toFixed(1)}%`;
function duration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return "–";
  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = String(total % 60).padStart(2, "0");
  return hours > 0
    ? `${String(hours)}:${String(minutes).padStart(2, "0")}:${rest}`
    : `${String(minutes)}:${rest}`;
}
const day = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" });
const dated = (iso: string | null) => (iso === null ? "–" : day.format(new Date(iso)));

type Sort = "newest" | "views" | "ctr" | "duration";

interface Line {
  readonly key: string;
  readonly projectId: string;
  readonly row: PerformanceRow;
  readonly isShort: boolean;
}

function Totals({
  label,
  totals,
}: {
  readonly label: string;
  readonly totals: PerformanceTotals;
}): ReactElement {
  return (
    <section aria-label={label} className="flex flex-col gap-2">
      <SectionHead as="h3" title={label} meta={`${String(totals.videos)} on YouTube`} />
      <Stats>
        <Stat value={whole(totals.views)} label="Views" />
        <Stat value={whole(totals.impressions)} label="Impressions" />
        <Stat value={percent(totals.ctr)} label="Click-through rate" />
        <Stat value={duration(totals.averageViewSeconds)} label="Average view duration" />
        <Stat value={whole(totals.watchHours)} label="Watch hours" />
      </Stats>
    </section>
  );
}

const sortValue = (project: PerformanceProject, sort: Sort): number => {
  const stats = project.long?.stats ?? null;
  if (sort === "views")
    return (
      (stats?.views ?? 0) + project.shorts.reduce((sum, one) => sum + (one.stats?.views ?? 0), 0)
    );
  if (sort === "ctr") return stats?.ctr ?? -1;
  if (sort === "duration") return stats?.averageViewSeconds ?? -1;
  return Date.parse(project.long?.releasedAt ?? project.shorts[0]?.releasedAt ?? "") || 0;
};

export function YoutubeTab({ channelId }: { readonly channelId: string }): ReactElement {
  const { api } = useApp();
  const [sort, setSort] = useState<Sort>("newest");
  const read = useQuery({
    queryKey: ["studio", "performance", channelId],
    queryFn: () => readChannelPerformance(api, channelId),
  });
  if (read.isPending) return <p className="text-small text-ink-3">Loading the numbers…</p>;
  if (read.isError)
    return (
      <p className="text-small text-danger">
        The numbers didn't load: {read.error.message} Reload the page to try again.
      </p>
    );
  const data = read.data;
  if (data.projects.length === 0)
    return (
      <EmptyState title="No video of this channel is known on YouTube yet">
        Upload with the Slopify Studio extension, or open YouTube Studio's Content list once so the
        extension links your videos. Their numbers then arrive daily, or at once with Read Studio
        numbers now in the extension's popup.
      </EmptyState>
    );
  const lines: Line[] = data.projects
    .toSorted((left, right) => sortValue(right, sort) - sortValue(left, sort))
    .flatMap((project) => [
      ...(project.long === null
        ? []
        : [
            {
              key: `${project.projectId}-0`,
              projectId: project.projectId,
              row: project.long,
              isShort: false,
            },
          ]),
      ...project.shorts.map((row) => ({
        key: `${project.projectId}-${String(row.short ?? 0)}`,
        projectId: project.projectId,
        row,
        isShort: true,
      })),
    ]);
  const columns: readonly Column<Line>[] = [
    {
      id: "title",
      header: "Video",
      cell: (line) =>
        line.isShort ? (
          <span className="block pl-5 text-small text-ink-2">
            {`Short ${String(line.row.short ?? "")} · ${line.row.title}`}
          </span>
        ) : (
          <Link to="/projects/$projectId" params={{ projectId: line.projectId }}>
            {line.row.title}
          </Link>
        ),
    },
    { id: "out", header: "Released", cell: (line) => dated(line.row.releasedAt) },
    {
      id: "impressions",
      header: "Impressions",
      numeric: true,
      cell: (line) => whole(line.row.stats?.impressions),
    },
    { id: "ctr", header: "CTR", numeric: true, cell: (line) => percent(line.row.stats?.ctr) },
    { id: "views", header: "Views", numeric: true, cell: (line) => whole(line.row.stats?.views) },
    {
      id: "duration",
      header: "Avg view",
      numeric: true,
      cell: (line) => duration(line.row.stats?.averageViewSeconds),
    },
    {
      id: "hours",
      header: "Watch hours",
      numeric: true,
      cell: (line) =>
        line.row.stats?.watchHours === null || line.row.stats?.watchHours === undefined
          ? "–"
          : line.row.stats.watchHours.toFixed(1),
    },
  ];
  return (
    <div className="flex flex-col gap-6">
      <p className="m-0 text-small text-ink-2">
        Studio's numbers as the Slopify Studio extension last read them
        {data.readAt === null ? "" : ` (newest ${dated(data.readAt)})`}: daily while Chrome is open,
        or at once with Read Studio numbers now in the extension's popup. "–" is a number Studio
        doesn't show for that video (most shorts have no click-through rate).
      </p>
      <div className="grid gap-6 md:grid-cols-2">
        <Totals label="Long videos" totals={data.long} />
        <Totals label="Shorts" totals={data.shorts} />
      </div>
      <section aria-label="Every video" className="flex flex-col gap-2">
        <SectionHead as="h3" title="Every video">
          <Select
            aria-label="Order"
            value={sort}
            onChange={(event) => setSort(event.currentTarget.value as Sort)}
            options={[
              { value: "newest", label: "Newest first" },
              { value: "views", label: "Most views" },
              { value: "ctr", label: "Best click-through rate" },
              { value: "duration", label: "Longest average view" },
            ]}
          />
        </SectionHead>
        <div className="overflow-x-auto">
          <DataTable
            columns={columns}
            rows={lines}
            rowKey={(line) => line.key}
            caption="The channel's videos and shorts with Studio's numbers"
          />
        </div>
      </section>
    </div>
  );
}
