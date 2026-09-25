import type { EntryCategory, PromptKind } from "@app/slices/library/model.js";
import {
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
  useNavigate,
} from "@tanstack/react-router";
import { Shell } from "@/components/shell";
import { categoryOf } from "@/lib/entry-options";
import { kindOf } from "@/lib/prompt-kinds";
import { usePlaySession } from "@/play/draft-context";
import { EntriesRoute } from "@/routes/entries";
import { EntryEditorRoute } from "@/routes/entry-editor";
import { LibraryLayout } from "@/routes/library";
import { PlayRoute } from "@/routes/play";
import { ProjectRoute } from "@/routes/project";
import { ProjectsRoute } from "@/routes/projects";
import { PromptEditorRoute } from "@/routes/prompt-editor";
import { PromptsRoute } from "@/routes/prompts";
import { SchedulesRoute } from "@/routes/schedules";
import { SettingsRoute, type SettingsSection, settingsSectionOf } from "@/routes/settings";
import { TemplatesRoute } from "@/routes/templates";

// A code-based route tree: a handful of screens need no file convention, and the
// generated tree a plugin would write would be one more artefact to keep honest.
const rootRoute = createRootRoute({ component: Shell });

// The kind tab of 04 and the kind a new prompt opens on live in the URL, so the tab survives a
// reload and "New prompt" can carry the tab it was pressed on into 05.
interface KindSearch {
  readonly kind: PromptKind;
}

interface NewPromptSearch extends KindSearch {
  // The prompt being duplicated, when Duplicate opened the editor.
  readonly from?: string;
}

// 09 Intros & Outros keeps its tab in the URL for the same reasons 04 does.
interface CategorySearch {
  readonly category: EntryCategory;
}

interface NewEntrySearch extends CategorySearch {
  readonly from?: string;
}

const projectsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: ProjectsRoute,
});

const playRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "play",
  component: PlayRoute,
});

// Prompts, Intros & Outros, Templates and Schedules are one destination with four tabs. The
// layout is pathless, so the four keep their own URLs and every existing link still lands.
const libraryRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "_library",
  component: LibraryLayout,
});

const libraryIndexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "library",
  beforeLoad: () => {
    throw redirect({ to: "/prompts", search: { kind: "article" } });
  },
});

const templatesRoute = createRoute({
  getParentRoute: () => libraryRoute,
  path: "templates",
  component: TemplatesPage,
});

const schedulesRoute = createRoute({
  getParentRoute: () => libraryRoute,
  path: "schedules",
  component: SchedulesRoute,
});
function TemplatesPage(): import("react").ReactElement {
  const session = usePlaySession();
  const navigate = useNavigate();
  return (
    <TemplatesRoute
      getGeneration={session.generation}
      blocked={
        session.review.starting || session.review.uncertain || session.review.created !== null
      }
      beforeApply={session.flush}
      onApplied={async (draftId, isCurrent) => {
        if (!isCurrent()) return false;
        if (!(await session.open(draftId, isCurrent))) return false;
        if (!isCurrent()) return false;
        await navigate({ to: "/play" });
        return isCurrent();
      }}
    />
  );
}

const projectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "projects/$projectId",
  component: ProjectPage,
});

const promptsRoute = createRoute({
  getParentRoute: () => libraryRoute,
  path: "prompts",
  validateSearch: (search: Record<string, unknown>): KindSearch => ({ kind: kindOf(search.kind) }),
  component: PromptsPage,
});

const newPromptRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "prompts/new",
  validateSearch: (search: Record<string, unknown>): NewPromptSearch => {
    const kind = kindOf(search.kind);
    return typeof search.from === "string" ? { kind, from: search.from } : { kind };
  },
  component: NewPromptPage,
});

const promptRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "prompts/$promptId",
  component: PromptPage,
});

const entriesRoute = createRoute({
  getParentRoute: () => libraryRoute,
  path: "entries",
  validateSearch: (search: Record<string, unknown>): CategorySearch => ({
    category: categoryOf(search.category),
  }),
  component: EntriesPage,
});

const newEntryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "entries/new",
  validateSearch: (search: Record<string, unknown>): NewEntrySearch => {
    const category = categoryOf(search.category);
    return typeof search.from === "string" ? { category, from: search.from } : { category };
  },
  component: NewEntryPage,
});

const entryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "entries/$entryId",
  component: EntryPage,
});

interface SettingsSearch {
  readonly section?: SettingsSection;
}

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "settings",
  validateSearch: (search: Record<string, unknown>): SettingsSearch =>
    search.section === undefined ? {} : { section: settingsSectionOf(search.section) },
  component: SettingsPage,
});

// Usage is a Settings section now; the old address still works.
const usageRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "usage",
  beforeLoad: () => {
    throw redirect({ to: "/settings", search: { section: "usage" } });
  },
});

function SettingsPage() {
  const { section } = settingsRoute.useSearch();
  const navigate = useNavigate();
  return (
    <SettingsRoute
      section={section ?? "providers"}
      onSection={(next) => {
        void navigate({ to: "/settings", search: { section: next }, replace: true });
      }}
    />
  );
}

function ProjectPage() {
  const { projectId } = projectRoute.useParams();
  return <ProjectRoute key={projectId} projectId={projectId} />;
}

function PromptsPage() {
  const { kind } = promptsRoute.useSearch();
  const navigate = useNavigate();
  return (
    <PromptsRoute
      kind={kind}
      onKind={(next) => {
        void navigate({ to: "/prompts", search: { kind: next }, replace: true });
      }}
    />
  );
}

function NewPromptPage() {
  const { kind, from } = newPromptRoute.useSearch();
  const leave = useLeave();
  return (
    <PromptEditorRoute
      key={`${kind}:${from ?? "new"}`}
      promptId={undefined}
      kind={kind}
      from={from}
      onLeave={leave}
    />
  );
}

function PromptPage() {
  const { promptId } = promptRoute.useParams();
  const leave = useLeave();
  return (
    <PromptEditorRoute
      key={promptId}
      promptId={promptId}
      // The row the editor loads carries the kind; the tab is only a default for a prompt
      // that does not exist yet.
      kind="article"
      from={undefined}
      onLeave={leave}
    />
  );
}

// Saving, deleting and leaving all land on the list, on the tab the prompt belongs to.
function useLeave(): (kind: PromptKind) => void {
  const navigate = useNavigate();
  return (kind) => {
    void navigate({ to: "/prompts", search: { kind } });
  };
}

function EntriesPage() {
  const { category } = entriesRoute.useSearch();
  const navigate = useNavigate();
  return (
    <EntriesRoute
      category={category}
      onCategory={(next) => {
        void navigate({ to: "/entries", search: { category: next }, replace: true });
      }}
    />
  );
}

function NewEntryPage() {
  const { category, from } = newEntryRoute.useSearch();
  const leave = useLeaveEntries();
  return <EntryEditorRoute entryId={undefined} category={category} from={from} onLeave={leave} />;
}

function EntryPage() {
  const { entryId } = entryRoute.useParams();
  const leave = useLeaveEntries();
  return (
    <EntryEditorRoute
      entryId={entryId}
      // The row the editor loads carries the category; the tab is only a default for an
      // entry that does not exist yet.
      category="intro"
      from={undefined}
      onLeave={leave}
    />
  );
}

function useLeaveEntries(): (category: EntryCategory) => void {
  const navigate = useNavigate();
  return (category) => {
    void navigate({ to: "/entries", search: { category } });
  };
}

const routeTree = rootRoute.addChildren({
  projectsRoute,
  playRoute,
  libraryRoute: libraryRoute.addChildren({
    promptsRoute,
    entriesRoute,
    templatesRoute,
    schedulesRoute,
  }),
  libraryIndexRoute,
  projectRoute,
  newPromptRoute,
  promptRoute,
  newEntryRoute,
  entryRoute,
  settingsRoute,
  usageRoute,
});

export function createAppRouter() {
  return createRouter({ routeTree });
}

export type AppRouter = ReturnType<typeof createAppRouter>;

declare module "@tanstack/react-router" {
  interface Register {
    router: AppRouter;
  }
}
