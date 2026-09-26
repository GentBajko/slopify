import { Outlet } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { PageBar } from "@/components/kit/page-bar";
import { TabLinks } from "@/components/kit/tabs";

// Everything reusable lives in one place: the prompts and spoken entries a run is written from,
// the saved setups it can start from, and the schedules that start it unattended. Each tab
// keeps its own URL, so a link to any of them still lands.
export const libraryTabs = [
  { to: "/prompts", label: "Prompts" },
  { to: "/entries", label: "Intros & Outros" },
  { to: "/templates", label: "Templates" },
  { to: "/document-themes", label: "Documents" },
  { to: "/schedules", label: "Schedules" },
] as const;

export function LibraryLayout(): ReactElement {
  return (
    <div>
      <PageBar title="Library" />
      <TabLinks items={libraryTabs} label="Library sections" className="mb-5" />
      <Outlet />
    </div>
  );
}

// The row every Library tab opens with: its filters on the left, its one action on the right.
export function LibraryToolbar({
  children,
  action,
}: {
  readonly children?: React.ReactNode;
  readonly action?: React.ReactNode;
}): ReactElement {
  return (
    <div className="mb-4 flex min-h-8 flex-wrap items-center gap-x-4 gap-y-2">
      {children}
      <span className="flex-1" />
      {action}
    </div>
  );
}
