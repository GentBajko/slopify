import type { Entry, EntryCategory, Prompt, PromptKind } from "@app/slices/library/model.js";
import {
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
  redirect,
  useLocation,
  useNavigate,
} from "@tanstack/react-router";
import { Shell } from "@/components/shell";
import { categoryOf } from "@/lib/entry-options";
import { kindOf } from "@/lib/prompt-kinds";
import { usePlaySession } from "@/play/draft-context";
import { pickInPlay } from "@/play/pick-in-play";
import { CalendarRoute, type CalendarTab, calendarTabOf } from "@/routes/calendar";
import { ChannelRoute, type ChannelTab, channelTabOf } from "@/routes/channel";
import { ChannelsRoute } from "@/routes/channels";
import { DocumentThemeEditorRoute } from "@/routes/document-theme-editor";
import { DocumentThemesRoute } from "@/routes/document-themes";
import { EntriesRoute } from "@/routes/entries";
import { EntryEditorRoute } from "@/routes/entry-editor";
import { HomeRoute } from "@/routes/home";
import { LibraryLayout } from "@/routes/library";
import { NarrationAliasesRoute } from "@/routes/narration-aliases";
import { PlayRoute } from "@/routes/play";
import { ProjectRoute } from "@/routes/project";
import { type ProjectFilter, ProjectsRoute, projectFilterOf } from "@/routes/projects";
import { PromptEditorRoute } from "@/routes/prompt-editor";
import { PromptsRoute } from "@/routes/prompts";
import { SettingsRoute, type SettingsSection, settingsSectionOf } from "@/routes/settings";
import { TemplatesRoute } from "@/routes/templates";
import { TutorialsRoute } from "@/routes/tutorials";
import { WelcomeRoute } from "@/routes/welcome";

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

// Home is the front door; the list of every project moved to /projects. Links into a project
// (/projects/$projectId) are unchanged.
const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: HomeRoute,
});

const projectsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "projects",
  validateSearch: (search: Record<string, unknown>): { show?: ProjectFilter } => {
    const show = projectFilterOf(search.show);
    return show === undefined ? {} : { show };
  },
  component: ProjectsPage,
});

function ProjectsPage() {
  const { show } = projectsRoute.useSearch();
  // Keyed so a link to another filter while on Projects starts from it.
  return <ProjectsRoute key={show ?? "all"} initialFilter={show ?? "all"} />;
}

// The first-run screen; Projects sends a fresh install here once (`routes/projects.tsx`).
const welcomeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "welcome",
  component: WelcomeRoute,
});

const playRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "play",
  component: PlayRoute,
});

// Prompts, Intros & Outros, Templates and Documents are one destination. The layout is
// pathless, so each keeps its own URL and every existing link still lands.
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

// Channels is a destination of its own in the rail, beside Library.
const channelsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "channels",
  component: ChannelsRoute,
});

interface ChannelSearch {
  readonly tab?: ChannelTab;
}

const channelRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "channels/$channelId",
  validateSearch: (search: Record<string, unknown>): ChannelSearch =>
    search.tab === undefined ? {} : { tab: channelTabOf(search.tab) },
  component: ChannelPage,
});

function ChannelPage() {
  const { channelId } = channelRoute.useParams();
  const { tab } = channelRoute.useSearch();
  const navigate = useNavigate();
  return (
    <ChannelRoute
      key={channelId}
      channelId={channelId}
      tab={tab ?? "brand"}
      onTab={(next) => {
        void navigate({
          to: "/channels/$channelId",
          params: { channelId },
          search: { tab: next },
          replace: true,
        });
      }}
    />
  );
}

const templatesRoute = createRoute({
  getParentRoute: () => libraryRoute,
  path: "templates",
  component: TemplatesPage,
});

// The calendar is a destination of its own; its schedules are its Schedules tab. The old
// addresses (/schedules, /schedules/$scheduleId) still land there, on the schedule they named.
interface CalendarSearch {
  readonly tab?: CalendarTab;
  readonly schedule?: string;
}

const scheduleIdPattern = /^[0-9A-Za-z-]{1,64}$/;

export function calendarSearchOf(search: Record<string, unknown>): CalendarSearch {
  if (calendarTabOf(search.tab) !== "schedules") return {};
  return typeof search.schedule === "string" && scheduleIdPattern.test(search.schedule)
    ? { tab: "schedules", schedule: search.schedule }
    : { tab: "schedules" };
}

const calendarRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "calendar",
  validateSearch: calendarSearchOf,
  component: CalendarPage,
});

const schedulesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "schedules",
  beforeLoad: () => {
    throw redirect({ to: "/calendar", search: { tab: "schedules" }, replace: true });
  },
});

const scheduleRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "schedules/$scheduleId",
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/calendar",
      search: calendarSearchOf({ tab: "schedules", schedule: params.scheduleId }),
      replace: true,
    });
  },
});

function CalendarPage() {
  // The route's search carries the raw address's keys beside the checked ones, so the tab is
  // read through `calendarTabOf` again.
  const search = calendarSearchOf(calendarRoute.useSearch());
  const navigate = useNavigate();
  return (
    <CalendarRoute
      tab={search.tab ?? "weeks"}
      schedule={search.schedule}
      onTab={(next) => {
        void navigate({
          to: "/calendar",
          search: next === "schedules" ? { tab: "schedules" } : {},
          replace: true,
        });
      }}
      onSchedule={(scheduleId) => {
        void navigate({
          to: "/calendar",
          search: { tab: "schedules", schedule: scheduleId },
          replace: true,
        });
      }}
    />
  );
}

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

const narrationAliasesRoute = createRoute({
  getParentRoute: () => libraryRoute,
  path: "narration-aliases",
  component: NarrationAliasesRoute,
});

const documentThemesRoute = createRoute({
  getParentRoute: () => libraryRoute,
  path: "document-themes",
  component: DocumentThemesRoute,
});

interface NewDocumentThemeSearch {
  // A built-in's name or a saved theme's id.
  readonly from?: string;
}

const newDocumentThemeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "document-themes/new",
  validateSearch: (search: Record<string, unknown>): NewDocumentThemeSearch =>
    typeof search.from === "string" ? { from: search.from } : {},
  component: NewDocumentThemePage,
});

const documentThemeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "document-themes/$themeId",
  component: DocumentThemePage,
});

interface SettingsSearch {
  readonly section?: SettingsSection;
  // Settings → Patch notes: the note open in the reading view.
  readonly note?: string;
}

function settingsSearchOf(search: Record<string, unknown>): SettingsSearch {
  const section = search.section === undefined ? undefined : settingsSectionOf(search.section);
  const note =
    section === "patch-notes" &&
    typeof search.note === "string" &&
    /^[0-9A-Za-z][0-9A-Za-z.-]{0,63}$/.test(search.note)
      ? search.note
      : undefined;
  return {
    ...(section === undefined ? {} : { section }),
    ...(note === undefined ? {} : { note }),
  };
}

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "settings",
  validateSearch: settingsSearchOf,
  component: SettingsPage,
});

// Help → Tutorials: the wiki's pages. The page is in the path, the section in the hash (the
// wiki's own anchors), and `q` the words a search result was opened with.
interface TutorialsSearch {
  readonly q?: string;
}

const tutorialsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "help/tutorials/$page",
  validateSearch: (search: Record<string, unknown>): TutorialsSearch =>
    typeof search.q === "string" && search.q.trim() !== "" ? { q: search.q.slice(0, 200) } : {},
  component: TutorialsPage,
});

function TutorialsPage() {
  const { page } = tutorialsRoute.useParams();
  const { q } = tutorialsRoute.useSearch();
  const hash = useLocation({ select: (location) => location.hash });
  return <TutorialsRoute page={page} anchor={hash === "" ? undefined : hash} words={q} />;
}

// /help and /help/tutorials open the tutorials' home page.
const helpRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "help",
  beforeLoad: () => {
    throw redirect({ to: "/help/tutorials/$page", params: { page: "Home" } });
  },
});
const tutorialsIndexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "help/tutorials",
  beforeLoad: () => {
    throw redirect({ to: "/help/tutorials/$page", params: { page: "Home" } });
  },
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
  const { section, note } = settingsRoute.useSearch();
  const navigate = useNavigate();
  return (
    <SettingsRoute
      section={section ?? "providers"}
      note={note}
      onSection={(next) => {
        void navigate({ to: "/settings", search: { section: next }, replace: true });
      }}
      onNote={(next) => {
        // Opening a note is a step a reader goes Back from.
        void navigate({
          to: "/settings",
          search: { section: "patch-notes", ...(next === undefined ? {} : { note: next }) },
        });
      }}
    />
  );
}

function ProjectPage() {
  const { projectId } = projectRoute.useParams();
  const session = usePlaySession();
  const navigate = useNavigate();
  return (
    <ProjectRoute
      key={projectId}
      projectId={projectId}
      openDraft={async (draftId) => {
        // The draft open in Play is saved first, as Templates' Apply does.
        if (!(await session.flush())) return false;
        if (!(await session.open(draftId))) return false;
        await navigate({ to: "/play" });
        return true;
      }}
    />
  );
}

function PromptsPage() {
  const { kind } = promptsRoute.useSearch();
  const navigate = useNavigate();
  const play = useUseInPlay();
  return (
    <PromptsRoute
      kind={kind}
      onKind={(next) => {
        void navigate({ to: "/prompts", search: { kind: next }, replace: true });
      }}
      onUseInPlay={play.use}
      playBlocked={play.blocked}
    />
  );
}

// Library → Use in Play: picks the prompt or intro/outro in the open Play draft and opens Play
// on the field that shows it. While a run is being started from the draft, the draft is not
// the user's to change, the same rule Templates' Use follows.
function useUseInPlay(): {
  readonly use: (item: Prompt | Entry) => void;
  readonly blocked: string | undefined;
} {
  const session = usePlaySession();
  const navigate = useNavigate();
  const blocked =
    session.review.starting || session.review.uncertain || session.review.created !== null
      ? "Play is starting a run from its draft. Wait for it to start, then try again."
      : undefined;
  return {
    blocked,
    use: (item) => {
      const picked = pickInPlay(session.document, item);
      session.edit(picked.document);
      void navigate({ to: "/play" }).then(() => session.navigate(picked.section, picked.field));
    },
  };
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
  const play = useUseInPlay();
  return (
    <EntriesRoute
      category={category}
      onCategory={(next) => {
        void navigate({ to: "/entries", search: { category: next }, replace: true });
      }}
      onUseInPlay={play.use}
      playBlocked={play.blocked}
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

function NewDocumentThemePage() {
  const { from } = newDocumentThemeRoute.useSearch();
  const leave = useLeaveDocumentThemes();
  return <DocumentThemeEditorRoute themeId={undefined} from={from} onLeave={leave} />;
}

function DocumentThemePage() {
  const { themeId } = documentThemeRoute.useParams();
  const leave = useLeaveDocumentThemes();
  return <DocumentThemeEditorRoute themeId={themeId} from={undefined} onLeave={leave} />;
}

function useLeaveDocumentThemes(): () => void {
  const navigate = useNavigate();
  return () => {
    void navigate({ to: "/document-themes" });
  };
}

function useLeaveEntries(): (category: EntryCategory) => void {
  const navigate = useNavigate();
  return (category) => {
    void navigate({ to: "/entries", search: { category } });
  };
}

// Dev only: the design-system gallery (routes/design.tsx). Vite replaces the flag with
// `false` in a production build, so the route is never built and its chunk drops out.
function makeDesignRoute() {
  return createRoute({
    getParentRoute: () => rootRoute,
    path: "design",
    component: lazyRouteComponent(() => import("@/routes/design"), "DesignRoute"),
  });
}

// Typed as present so the tree's types stay exact; nothing links to /design.
const devRoutes = (import.meta.env.DEV ? { designRoute: makeDesignRoute() } : {}) as {
  designRoute: ReturnType<typeof makeDesignRoute>;
};

const routeTree = rootRoute.addChildren({
  homeRoute,
  projectsRoute,
  welcomeRoute,
  playRoute,
  libraryRoute: libraryRoute.addChildren({
    promptsRoute,
    entriesRoute,
    templatesRoute,
    documentThemesRoute,
    narrationAliasesRoute,
  }),
  schedulesRoute,
  scheduleRoute,
  calendarRoute,
  libraryIndexRoute,
  channelsRoute,
  channelRoute,
  projectRoute,
  newPromptRoute,
  promptRoute,
  newEntryRoute,
  entryRoute,
  newDocumentThemeRoute,
  documentThemeRoute,
  settingsRoute,
  usageRoute,
  helpRoute,
  tutorialsIndexRoute,
  tutorialsRoute,
  ...devRoutes,
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
