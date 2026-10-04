import type { ScheduleSummary } from "@app/slices/schedules/model.js";
import type { ReactElement } from "react";
import { Input, Select } from "@/components/kit/field";
import { helpScope, InfoTip } from "@/components/kit/info-tip";

// With this many schedules the list gets a search field and a sort order.
export const listToolsFrom = 5;

export type ScheduleSort = "newest" | "next" | "name" | "changed";

const sortLabels: Readonly<Record<ScheduleSort, string>> = {
  newest: "Newest first",
  next: "Next run first",
  name: "Name A–Z",
  changed: "Recently changed",
};

const isSort = (value: string): value is ScheduleSort => Object.hasOwn(sortLabels, value);

// The schedules whose name holds every word searched, in the chosen order. The list
// arrives newest first.
export function arrangeSchedules(
  schedules: readonly ScheduleSummary[],
  query: string,
  sort: ScheduleSort,
): readonly ScheduleSummary[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const found = schedules.filter((schedule) =>
    words.every((word) => schedule.name.toLowerCase().includes(word)),
  );
  if (sort === "newest") return found;
  return [...found].sort((a, b) =>
    sort === "name"
      ? a.name.localeCompare(b.name)
      : sort === "changed"
        ? b.updatedAt.localeCompare(a.updatedAt)
        : // No next run sorts last.
          (a.nextRunAt ?? "~").localeCompare(b.nextRunAt ?? "~"),
  );
}

export function ScheduleListTools({
  query,
  sort,
  onQuery,
  onSort,
}: {
  readonly query: string;
  readonly sort: ScheduleSort;
  readonly onQuery: (query: string) => void;
  readonly onSort: (sort: ScheduleSort) => void;
}): ReactElement {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2" {...helpScope}>
      <Input
        type="search"
        aria-label="Search schedules by name"
        placeholder="Search schedules"
        value={query}
        className="min-w-0 flex-1"
        onChange={(event) => onQuery(event.target.value)}
      />
      <Select
        aria-label="Sort schedules"
        value={sort}
        className="w-auto"
        onChange={(event) => {
          const picked = event.target.value;
          if (isSort(picked)) onSort(picked);
        }}
      >
        {(Object.keys(sortLabels) as ScheduleSort[]).map((key) => (
          <option key={key} value={key}>
            {sortLabels[key]}
          </option>
        ))}
      </Select>
      <InfoTip id="planning.schedules" />
    </div>
  );
}
