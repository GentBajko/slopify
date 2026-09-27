import { Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import type { ReactElement, ReactNode } from "react";
import { useCommand } from "@/components/kit/command-palette";
import { PageHeader } from "@/components/kit/layout";
import { TabLinks } from "@/components/kit/tabs";
import { categoryOf } from "@/lib/entry-options";
import { kindOf } from "@/lib/prompt-kinds";
import { cn } from "@/lib/utils";

// Everything reusable lives in one place: the prompts and spoken entries a run is written from,
// the saved setups it can start from, and the looks a project's PDF can take. Each tab keeps
// its own URL, so a link to any of them still lands.
export const libraryTabs = [
  { to: "/prompts", label: "Prompts" },
  { to: "/entries", label: "Intros & Outros" },
  { to: "/templates", label: "Templates" },
  { to: "/document-themes", label: "Documents" },
  { to: "/narration-aliases", label: "Aliases" },
] as const;

export function LibraryLayout(): ReactElement {
  return (
    <div>
      <PageHeader
        title="Library"
        meta="Prompts, intros and outros, templates, document themes and narration aliases"
      />
      <TabLinks items={libraryTabs} label="Library sections" className="mb-6" />
      <LibraryCommands />
      <Outlet />
    </div>
  );
}

// The Library's frequent actions in Ctrl+K, on every tab: making a new item of each kind
// (a new prompt or intro/outro starts on the kind or category the tab is showing) and moving
// between the tabs.
function LibraryCommands(): null {
  const navigate = useNavigate();
  const location = useRouterState({ select: (state) => state.location });
  const search = location.search as Readonly<Record<string, unknown>>;
  const kind = kindOf(location.pathname === "/prompts" ? search.kind : undefined);
  const category = categoryOf(location.pathname === "/entries" ? search.category : undefined);
  useCommand({
    id: "library.new-prompt",
    title: "New prompt",
    group: "Library",
    keywords: ["create", "article", "image", "thumbnail"],
    run: () => {
      void navigate({ to: "/prompts/new", search: { kind } });
    },
  });
  useCommand({
    id: "library.new-entry",
    title: "New intro or outro",
    group: "Library",
    keywords: ["create", "entry"],
    run: () => {
      void navigate({ to: "/entries/new", search: { category } });
    },
  });
  useCommand({
    id: "library.new-document-theme",
    title: "New document theme",
    group: "Library",
    keywords: ["create", "pdf", "theme"],
    run: () => {
      void navigate({ to: "/document-themes/new", search: { from: "plain" } });
    },
  });
  useCommand({
    id: "library.open-prompts",
    title: "Open prompts",
    group: "Library",
    run: () => {
      void navigate({ to: "/prompts", search: { kind: "article" } });
    },
  });
  useCommand({
    id: "library.open-entries",
    title: "Open intros and outros",
    group: "Library",
    keywords: ["entries"],
    run: () => {
      void navigate({ to: "/entries", search: { category: "intro" } });
    },
  });
  useCommand({
    id: "library.open-templates",
    title: "Open templates",
    group: "Library",
    keywords: ["setups"],
    run: () => {
      void navigate({ to: "/templates" });
    },
  });
  useCommand({
    id: "library.open-document-themes",
    title: "Open document themes",
    group: "Library",
    keywords: ["pdf", "documents"],
    run: () => {
      void navigate({ to: "/document-themes" });
    },
  });
  return null;
}

// The row a Library tab opens with: its filters on the left, its one action on the right.
// On a phone the action wraps under the filters.
export function LibraryToolbar({
  children,
  action,
  className,
}: {
  readonly children?: ReactNode;
  readonly action?: ReactNode;
  readonly className?: string;
}): ReactElement {
  return (
    <div
      data-slot="library-toolbar"
      className={cn("mb-5 flex min-h-9 flex-wrap items-center gap-x-4 gap-y-3", className)}
    >
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">{children}</div>
      {action === undefined ? null : <div className="sl-btn-row ml-auto shrink-0">{action}</div>}
    </div>
  );
}
