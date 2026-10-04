import type { ProjectState } from "@app/kernel/pipeline.js";
import type { ProjectListing } from "@app/slices/admission/model.js";
import { isWaiting } from "@/home/needs-you";
import { isReadyToUpload } from "@/home/ready";
import { isQueued } from "@/home/running-more";

const filterValues = ["all", "running", "queued", "waiting", "ready", "failed"] as const;
export type ProjectFilter = (typeof filterValues)[number];

// The `?show=` search value Home's links use ("See all 5 running"); anything else is All.
export function projectFilterOf(value: unknown): ProjectFilter | undefined {
  return filterValues.find((one) => one === value);
}

export const filters: readonly { readonly value: ProjectFilter; readonly label: string }[] = [
  { value: "all", label: "All" },
  { value: "running", label: "Running" },
  { value: "queued", label: "Queued" },
  { value: "waiting", label: "Needs you" },
  { value: "ready", label: "Ready to upload" },
  { value: "failed", label: "Failed" },
];

export function matches(project: ProjectListing, filter: ProjectFilter): boolean {
  switch (filter) {
    case "all":
      return true;
    case "running":
      return project.status === "running" || project.status === "paused";
    case "queued":
      return isQueued(project);
    case "waiting":
      return isWaiting(project);
    case "ready":
      return isReadyToUpload(project);
    case "failed":
      return project.status === "failed" || project.status === "partial";
  }
}

// The order of the Projects list (`?sort=` in the address). Newest started is the default and
// is left out of the address.
const sortValues = ["newest", "changed", "name", "status"] as const;
export type ProjectSort = (typeof sortValues)[number];

export function projectSortOf(value: unknown): ProjectSort | undefined {
  return sortValues.find((one) => one === value);
}

export const sortOptions: readonly { readonly value: ProjectSort; readonly label: string }[] = [
  { value: "newest", label: "Newest first" },
  { value: "changed", label: "Recently changed" },
  { value: "name", label: "Name (A–Z)" },
  { value: "status", label: "Status" },
];

// Status order: what needs a hand first, then what is moving, then what is finished.
const statusRank: Readonly<Record<ProjectState, number>> = {
  running: 1,
  paused: 2,
  pending: 3,
  failed: 4,
  partial: 5,
  done: 6,
  canceled: 7,
};

function rankOf(project: ProjectListing): number {
  return isWaiting(project) ? 0 : statusRank[project.status];
}

const newestFirst = (a: ProjectListing, b: ProjectListing): number =>
  b.createdAt.localeCompare(a.createdAt);

export function sortProjects(
  projects: readonly ProjectListing[],
  sort: ProjectSort,
): readonly ProjectListing[] {
  const order: Readonly<Record<ProjectSort, (a: ProjectListing, b: ProjectListing) => number>> = {
    newest: newestFirst,
    changed: (a, b) => b.updatedAt.localeCompare(a.updatedAt) || newestFirst(a, b),
    name: (a, b) =>
      a.title.localeCompare(b.title, undefined, { sensitivity: "base", numeric: true }) ||
      newestFirst(a, b),
    status: (a, b) => rankOf(a) - rankOf(b) || newestFirst(a, b),
  };
  return [...projects].sort(order[sort]);
}

// Rows drawn at once; "Show more" adds the next page.
export const projectsPage = 50;
