import type { Entry, EntryCategory, Prompt, PromptKind } from "@app/slices/library/model.js";
import { type TemplateSection, templateSections } from "@app/slices/template-studio/model.js";
import {
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
  redirect,
  useLocation,
  useNavigate,
} from "@tanstack/react-router";
import { useDocumentTitle } from "@/components/document-title";
import { Shell } from "@/components/shell";
import { DesignRoute } from "@/designs/design-page";
import { DesignsRoute } from "@/designs/designs-route";
import { DesignTemplateRoute } from "@/designs/editor/template-editor";
import { categoryOf } from "@/lib/entry-options";
import { kindOf } from "@/lib/prompt-kinds";
import { itemOf } from "@/library/list-url";
import { usePlaySession } from "@/play/draft-context";
import { pickInPlay } from "@/play/pick-in-play";
import type { SectionId } from "@/project/next-action";
import { AbResultsRoute } from "@/routes/ab-results";
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
import { NotFoundRoute, RouteError } from "@/routes/not-found";
import { PlayRoute } from "@/routes/play";
import { ProjectRoute, projectSectionOf } from "@/routes/project";
import {
  type ProjectFilter,
  type ProjectSort,
  ProjectsRoute,
  projectFilterOf,
  projectSortOf,
} from "@/routes/projects";
import { PromptEditorRoute } from "@/routes/prompt-editor";
import { PromptsRoute } from "@/routes/prompts";
import {
  SettingsRoute,
  type SettingsSection,
  settingsSectionOf,
  settingsSections,
} from "@/routes/settings";
import { keysArrival } from "@/routes/settings-sections";
import { TemplatesRoute, type TemplatesTab, templatesTabOf } from "@/routes/templates";
import { TutorialsRoute } from "@/routes/tutorials";
import { WelcomeRoute, type WelcomeStep, welcomeSteps } from "@/routes/welcome";
import { TemplateStudioPage } from "@/template-studio/page";
import { usePlayHandoff } from "@/templates/play-handoff";

// A code-based route tree: a handful of screens need no file convention, and the
// generated tree a plugin would write would be one more artefact to keep honest.
// An address no route answers shows the not-found screen inside the shell, and a screen
// that throws while drawing shows its error there, so the rail stays usable either way.
const rootRoute = createRootRoute({ component: Shell, notFoundComponent: NotFoundRoute });

// The kind tab of 04 and the kind a new prompt opens on live in the URL, so the tab survives a
// reload and "New prompt" can carry the tab it was pressed on into 05.
interface KindSearch {
  readonly kind: PromptKind;
}

// The Library row shown beside a list (`library/list-url.ts`), so its address opens that row.
interface ItemSearch {
  readonly item?: string;
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
  component: HomePage,
});

// Home's Start from a template hands the template to Create the way Templates does: the open
// draft is saved first, then Create opens on the new draft.
function HomePage(): import("react").ReactElement {
  const session = usePlaySession();
  const navigate = useNavigate();
  return (
    <HomeRoute
      startFrom={{
        getGeneration: session.generation,
        blocked:
          session.review.starting || session.review.uncertain || session.review.created !== null,
        beforeApply: session.flush,
        onApplied: async (draftId, isCurrent) => {
          if (!isCurrent()) return false;
          if (!(await session.open(draftId, isCurrent))) return false;
          if (!isCurrent()) return false;
          await navigate({ to: "/play" });
          return isCurrent();
        },
      }}
    />
  );
}

// The filter and the search words are in the address, so Back from a project, a reload and a
// new tab all return to the same list. Changing them replaces the entry: a filter is not a
// place to go Back through, and neither is every typed letter.
interface ProjectsSearch {
  readonly show?: ProjectFilter;
  readonly q?: string;
  readonly sort?: ProjectSort;
}

export function projectsSearchOf(search: Record<string, unknown>): ProjectsSearch {
  const show = projectFilterOf(search.show);
  const q = typeof search.q === "string" && search.q.trim() !== "" ? search.q.slice(0, 200) : "";
  const sort = projectSortOf(search.sort);
  return {
    ...(show === undefined || show === "all" ? {} : { show }),
    ...(q === "" ? {} : { q }),
    ...(sort === undefined || sort === "newest" ? {} : { sort }),
  };
}

const projectsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "projects",
  validateSearch: projectsSearchOf,
  component: ProjectsPage,
});

function ProjectsPage() {
  const { show, q, sort } = projectsRoute.useSearch();
  const navigate = useNavigate();
  return (
    <ProjectsRoute
      filter={show ?? "all"}
      query={q ?? ""}
      sort={sort ?? "newest"}
      onFilter={(next) => {
        void navigate({
          to: "/projects",
          search: projectsSearchOf({ show: next, q, sort }),
          replace: true,
          resetScroll: false,
        });
      }}
      onQuery={(next) => {
        void navigate({
          to: "/projects",
          search: projectsSearchOf({ show, q: next, sort }),
          replace: true,
          resetScroll: false,
        });
      }}
      onSort={(next) => {
        void navigate({
          to: "/projects",
          search: projectsSearchOf({ show, q, sort: next }),
          replace: true,
          resetScroll: false,
        });
      }}
    />
  );
}

// The first-run screen; Home sends a fresh install here once (`routes/home.tsx`). The step is
// in the address, so a detour to Settings for a key comes back to it (`?step=make`).
interface WelcomeSearch {
  readonly step?: WelcomeStep;
}

function welcomeSearchOf(search: Record<string, unknown>): WelcomeSearch {
  const step = welcomeSteps.find((one) => one === search.step);
  return step === undefined || step === "found" ? {} : { step };
}

const welcomeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "welcome",
  validateSearch: welcomeSearchOf,
  component: WelcomePage,
});

function WelcomePage() {
  const { step } = welcomeRoute.useSearch();
  const navigate = useNavigate();
  return (
    <WelcomeRoute
      step={step ?? "found"}
      onStep={(next) => {
        // A step is part of one page, not a place of its own: Back leaves the welcome.
        void navigate({ to: "/welcome", search: welcomeSearchOf({ step: next }), replace: true });
      }}
    />
  );
}

const playRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "play",
  component: PlayRoute,
});

// Prompts (with intros and outros), Templates, Designs, PDF themes, pronunciation aliases and
// A/B results share one pathless layout for their Ctrl+K commands; each keeps its own URL and
// header, so every existing link still lands.
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

interface ChannelSearch {
  readonly tab?: ChannelTab;
}

// Channels is a destination of its own in the rail. With one channel it is that channel's page,
// so its tab is in the address too (`/channels?tab=cast`).
const channelsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "channels",
  validateSearch: (search: Record<string, unknown>): ChannelSearch =>
    search.tab === undefined ? {} : { tab: channelTabOf(search.tab) },
  component: ChannelsPage,
});

function ChannelsPage() {
  const { tab } = channelsRoute.useSearch();
  const navigate = useNavigate();
  return (
    <ChannelsRoute
      tab={tab ?? "brand"}
      onTab={(next) => {
        void navigate({ to: "/channels", search: { tab: next }, resetScroll: false });
      }}
    />
  );
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
          resetScroll: false,
        });
      }}
    />
  );
}

// Designs: the pictures edited and the posters designed. Its old Templates tab is Templates →
// Poster templates now, and its address still lands there.
const designsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "designs",
  beforeLoad: ({ search }) => {
    if ((search as Record<string, unknown>).tab === "templates")
      throw redirect({ to: "/templates", search: { tab: "posters" }, replace: true });
  },
  component: DesignsRoute,
});

const designPageRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "designs/$designId",
  component: DesignPage,
});

function DesignPage() {
  const { designId } = designPageRoute.useParams();
  return <DesignRoute key={designId} designId={designId} />;
}

const designTemplateRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "design-templates/$templateId",
  component: DesignTemplatePage,
});

function DesignTemplatePage() {
  const { templateId } = designTemplateRoute.useParams();
  return <DesignTemplateRoute key={templateId} templateId={templateId} />;
}

// Templates: video templates, and poster templates on their own tab (`?tab=posters`).
// `?item=` names a template to show (a link from the calendar or Ctrl+K).
interface TemplatesSearch extends ItemSearch {
  readonly tab?: TemplatesTab;
}

const templatesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "templates",
  validateSearch: (search: Record<string, unknown>): TemplatesSearch => ({
    ...(templatesTabOf(search.tab) === "posters" ? { tab: "posters" as const } : {}),
    ...itemOf(search.item),
  }),
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
  const tab = calendarTabOf(search.tab);
  if (tab === "releases") return { tab };
  if (tab !== "schedules") return {};
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
        // A tab is a place: Back returns to the one before.
        void navigate({
          to: "/calendar",
          search: next === "weeks" ? {} : { tab: next },
          resetScroll: false,
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
  const { tab, item } = templatesRoute.useSearch();
  const navigate = useNavigate();
  return (
    <TemplatesRoute
      {...usePlayHandoff()}
      tab={tab ?? "videos"}
      item={item}
      onTab={(next) => {
        // A tab is a place: Back returns to the one before.
        void navigate({
          to: "/templates",
          search: next === "posters" ? { tab: "posters" } : {},
          resetScroll: false,
        });
      }}
    />
  );
}

// Templates → Edit template. `?section=` is the section shown; any other value opens the first.
const templateStudioRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "templates/$templateId",
  validateSearch: (search: Record<string, unknown>): StudioSearch => {
    const section = templateSections.find((one) => one === search.section);
    const named = (value: unknown): string | undefined =>
      typeof value === "string" && value.trim() !== "" && value.length <= 200 ? value : undefined;
    const provider = named(search.compareProvider);
    const model = named(search.compareModel);
    return {
      ...(section === undefined ? {} : { section }),
      ...(provider === undefined || model === undefined
        ? {}
        : { compareProvider: provider, compareModel: model }),
    };
  },
  component: TemplateStudioRoutePage,
});

// `?compareProvider=&compareModel=`: a model Settings → Models offers to compare on a sample.
interface StudioSearch {
  readonly section?: TemplateSection;
  readonly compareProvider?: string;
  readonly compareModel?: string;
}

function TemplateStudioRoutePage(): import("react").ReactElement {
  const { templateId } = templateStudioRoute.useParams();
  const { section, compareProvider, compareModel } = templateStudioRoute.useSearch();
  return (
    <TemplateStudioPage
      key={templateId}
      templateId={templateId}
      play={usePlayHandoff()}
      section={section ?? "subject"}
      compare={
        compareProvider === undefined || compareModel === undefined
          ? undefined
          : { provider: compareProvider, model: compareModel }
      }
    />
  );
}

const projectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "projects/$projectId",
  validateSearch: (search: Record<string, unknown>): { section?: SectionId } => {
    const section = projectSectionOf(search.section);
    return section === undefined ? {} : { section };
  },
  component: ProjectPage,
});

const promptsRoute = createRoute({
  getParentRoute: () => libraryRoute,
  path: "prompts",
  validateSearch: (search: Record<string, unknown>): KindSearch & ItemSearch => ({
    kind: kindOf(search.kind),
    ...itemOf(search.item),
  }),
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
  validateSearch: (search: Record<string, unknown>): CategorySearch & ItemSearch => ({
    category: categoryOf(search.category),
    ...itemOf(search.item),
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

const abResultsRoute = createRoute({
  getParentRoute: () => libraryRoute,
  path: "ab-results",
  component: AbResultsRoute,
});

const documentThemesRoute = createRoute({
  getParentRoute: () => libraryRoute,
  path: "document-themes",
  validateSearch: (search: Record<string, unknown>): ItemSearch => itemOf(search.item),
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
  // A fix opened from the first-run checklist: the service family and the service to open
  // ("tts", "openai-tts"), and the screen and step to go back to.
  readonly family?: "llm" | "tts" | "image";
  readonly provider?: string;
  readonly return?: "welcome" | "play";
  readonly step?: string;
}

function settingsSearchOf(search: Record<string, unknown>): SettingsSearch {
  const section = search.section === undefined ? undefined : settingsSectionOf(search.section);
  const note =
    section === "patch-notes" &&
    typeof search.note === "string" &&
    /^[0-9A-Za-z][0-9A-Za-z.-]{0,63}$/.test(search.note)
      ? search.note
      : undefined;
  const family = (["llm", "tts", "image"] as const).find((one) => one === search.family);
  const provider =
    typeof search.provider === "string" && /^[a-z0-9-]{1,40}$/.test(search.provider)
      ? search.provider
      : undefined;
  const back = (["welcome", "play"] as const).find((one) => one === search.return);
  const step =
    back !== undefined && typeof search.step === "string" && /^[a-z-]{1,20}$/.test(search.step)
      ? search.step
      : undefined;
  return {
    ...(section === undefined ? {} : { section }),
    ...(note === undefined ? {} : { note }),
    ...(family === undefined ? {} : { family }),
    ...(provider === undefined ? {} : { provider }),
    ...(back === undefined ? {} : { return: back }),
    ...(step === undefined ? {} : { step }),
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
  const { section, note, family, provider, return: back, step } = settingsRoute.useSearch();
  const navigate = useNavigate();
  const shown = settingsSections.find((one) => one.id === (section ?? "providers"));
  useDocumentTitle(shown === undefined ? "Settings" : `Settings · ${shown.label}`);
  return (
    <SettingsRoute
      section={section ?? "providers"}
      note={note}
      family={family}
      provider={provider}
      back={back === undefined ? undefined : { to: back, step }}
      onSection={(next) => {
        // A section is a place: Back returns to the one before. The way back to the welcome or
        // Create stays while the person moves between Keys & services and Voices.
        void navigate({
          to: "/settings",
          search: {
            section: next,
            ...(back === undefined ? {} : { return: back }),
            ...(step === undefined ? {} : { step }),
          },
          resetScroll: false,
        });
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
  const make = useMakeVideo();
  return <PromptsRoute kind={kind} onMakeVideo={make.use} makeBlocked={make.blocked} />;
}

// Prompts → Make a video: picks the prompt or intro/outro in the open Create draft and opens
// Create on the field that shows it. While a video is being started from the draft, the draft is
// not the user's to change, the same rule a template's Make a video follows.
function useMakeVideo(): {
  readonly use: (item: Prompt | Entry) => void;
  readonly blocked: string | undefined;
} {
  const session = usePlaySession();
  const navigate = useNavigate();
  const blocked =
    session.review.starting || session.review.uncertain || session.review.created !== null
      ? "Create is starting a video from its draft. Wait for it to start, then try again."
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
  const make = useMakeVideo();
  return (
    <PromptEditorRoute
      key={`${kind}:${from ?? "new"}`}
      promptId={undefined}
      kind={kind}
      from={from}
      onLeave={leave}
      onMakeVideo={make.blocked === undefined ? make.use : undefined}
    />
  );
}

function PromptPage() {
  const { promptId } = promptRoute.useParams();
  const leave = useLeave();
  const make = useMakeVideo();
  return (
    <PromptEditorRoute
      key={promptId}
      promptId={promptId}
      // The row the editor loads carries the kind; the list's kind is only a default for a
      // prompt that does not exist yet.
      kind="article"
      from={undefined}
      onLeave={leave}
      onMakeVideo={make.blocked === undefined ? make.use : undefined}
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
  const make = useMakeVideo();
  return <EntriesRoute category={category} onMakeVideo={make.use} makeBlocked={make.blocked} />;
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
    documentThemesRoute,
    narrationAliasesRoute,
    abResultsRoute,
  }),
  templatesRoute,
  templateStudioRoute,
  designsRoute,
  schedulesRoute,
  scheduleRoute,
  calendarRoute,
  libraryIndexRoute,
  channelsRoute,
  channelRoute,
  designPageRoute,
  designTemplateRoute,
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
  return createRouter({
    routeTree,
    defaultErrorComponent: RouteError,
    // Back and Forward return to where the page was scrolled; a new screen starts at the top,
    // except a link to a service on Keys & services, which scrolls to that service's setup
    // itself (`keysArrival`): a reset landing after that scroll would undo it.
    scrollRestoration: ({ location }) =>
      !keysArrival(location.pathname, location.search as Readonly<Record<string, unknown>>),
  });
}

export type AppRouter = ReturnType<typeof createAppRouter>;

declare module "@tanstack/react-router" {
  interface Register {
    router: AppRouter;
  }
}
