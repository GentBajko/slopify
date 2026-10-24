import { useQueryClient } from "@tanstack/react-query";
import { Link, Outlet, useLocation } from "@tanstack/react-router";
import {
  BookOpenIcon,
  CalendarIcon,
  CircleHelpIcon,
  CompassIcon,
  EllipsisIcon,
  FilmIcon,
  HandHeartIcon,
  HouseIcon,
  KeyboardIcon,
  LayoutTemplateIcon,
  NewspaperIcon,
  PlusIcon,
  ScrollTextIcon,
  SearchIcon,
  SettingsIcon,
  SparklesIcon,
  TvIcon,
} from "lucide-react";
import { type ReactElement, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { eventsUrl } from "@/api";
import { useApp } from "@/app-context";
import { AssistantPanel } from "@/assistant/panel";
import { AssistantScreenProvider } from "@/assistant/screen";
import { AutostartReminder } from "@/autostart/autostart-reminder";
import { useInstallKind } from "@/autostart/use-install-kind";
import { CurrentChannelProvider, useCurrentChannel } from "@/channels/current";
import { ConnectionStatus } from "@/components/connection-status";
import { GlobalCommands } from "@/components/global-commands";
import { SupportGlyph } from "@/components/glyph";
import { Button, PlayKey } from "@/components/kit/button";
import {
  ariaKeyShortcuts,
  CommandPaletteProvider,
  useCommandPalette,
} from "@/components/kit/command-palette";
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuTrigger,
} from "@/components/kit/menu";
import { Lamp } from "@/components/kit/status";
import { Logo } from "@/components/logo";
import { FirstRunNotice } from "@/components/notice";
import { ShellCommands } from "@/components/shell-commands";
import { useShellLocation } from "@/components/shell-location";
import { AppearanceSkin } from "@/components/theme";
import { VersionPrompt } from "@/components/version-prompt";
import { type Connection, subscribeGlobal } from "@/events";
import { FormDraftsProvider } from "@/lib/form-drafts";
import { shortcuts } from "@/lib/shortcuts";
import { cn } from "@/lib/utils";
import { useRunNotifications } from "@/notifications/use-run-notifications";
import { PatchNotesCommand, PatchNotesPopup } from "@/patch-notes/popup";
import { PlayDraftProvider } from "@/play/draft-context";
import { coalesce } from "@/project/live";
import { keys } from "@/queries";
import { TutorialProvider, useTutorial } from "@/tutorial/context";
import { TutorialCommands } from "@/tutorials/commands";
import { type UpdateView, useUpdate } from "@/updates/use-update";
import { UpdateMenuRows, UpdateWidget, updateWords } from "@/updates/widget";
import { WhatsNewTour } from "@/whats-new/tour";

// The shell (docs/design-system.md, Shell). From 768px up: a --rail-width (76px) rail of icons
// with a word under each, on every page. Top to bottom: the logo, the lime Create key, the
// destinations, "N running" while runs are active, and at the foot Search, Assistant, Help and
// Support. Below 768px: a top bar (logo, Search, Help) and a bottom bar with Create in the
// centre. Nothing else lives in the rail; a page's own controls stay on the page.
//
// `match` lists the paths a destination stays lit for.
interface Destination {
  readonly id: string;
  readonly to: string;
  readonly label: string;
  readonly icon: ReactElement;
  readonly match: readonly string[];
  // Listed only with two or more channels; with one, its pages light Settings, where the
  // channel is reached from.
  readonly several?: true;
}

const iconProps = { "aria-hidden": true, strokeWidth: 1.75 } as const;

const destinations: readonly Destination[] = [
  { id: "home", to: "/", label: "Home", icon: <HouseIcon {...iconProps} />, match: ["/"] },
  {
    id: "projects",
    to: "/projects",
    label: "Projects",
    icon: <FilmIcon {...iconProps} />,
    match: ["/projects"],
  },
  {
    id: "prompts",
    to: "/prompts",
    label: "Prompts",
    icon: <ScrollTextIcon {...iconProps} />,
    match: ["/prompts", "/entries", "/library"],
  },
  {
    id: "templates",
    to: "/templates",
    label: "Templates",
    icon: <LayoutTemplateIcon {...iconProps} />,
    match: ["/templates", "/designs", "/design-templates"],
  },
  {
    id: "calendar",
    to: "/calendar",
    label: "Calendar",
    icon: <CalendarIcon {...iconProps} />,
    match: ["/calendar", "/schedules"],
  },
  {
    id: "channels",
    to: "/channels",
    label: "Channels",
    icon: <TvIcon {...iconProps} />,
    match: ["/channels", "/ab-results"],
    several: true,
  },
  {
    id: "settings",
    to: "/settings",
    label: "Settings",
    icon: <SettingsIcon {...iconProps} />,
    match: ["/settings", "/usage", "/document-themes", "/narration-aliases"],
  },
];

// The phone's bottom bar: Home and Projects, Create in the centre, Prompts, and More for the rest.
const phoneBar = new Set(["home", "projects", "prompts"]);

export function isActive(pathname: string, match: readonly string[]): boolean {
  return match.some((path) =>
    path === "/" ? pathname === "/" : pathname === path || pathname.startsWith(`${path}/`),
  );
}

// The rail item a page lights, by its address. With one channel Channels is not listed, and
// its pages light Settings.
export function activeDestination(pathname: string, channels = 2): string | undefined {
  const found = destinations.find((destination) => isActive(pathname, destination.match));
  if (found?.several === true && channels < 2) return "settings";
  return found?.id;
}

function useDestinations(): readonly Destination[] {
  const several = useCurrentChannel().channels.length > 1;
  return destinations.filter((destination) => several || destination.several !== true);
}

const support = [
  { href: "https://github.com/GentBajko/slopify", label: "GitHub", glyph: "github", tone: "" },
  {
    href: "https://www.patreon.com/cw/GentBajko",
    label: "Patreon",
    glyph: "patreon",
    tone: "text-accent-ink",
  },
  {
    href: "https://buymeacoffee.com/gentbajko",
    label: "Buy Me a Coffee",
    glyph: "coffee",
    tone: "text-accent-ink",
  },
] as const;

function SupportRows(): ReactElement {
  return (
    <>
      <MenuLabel>Support Slopify</MenuLabel>
      {support.map((link) => (
        <MenuItem key={link.href} asChild>
          <a href={link.href} target="_blank" rel="noreferrer" className="no-underline">
            <SupportGlyph name={link.glyph} className={link.tone} />
            {link.label}
          </a>
        </MenuItem>
      ))}
    </>
  );
}

export function Shell() {
  return (
    <FormDraftsProvider>
      <PlayDraftProvider>
        <TutorialProvider>
          <CommandPaletteProvider>
            <CurrentChannelProvider>
              <AssistantScreenProvider>
                <ShellContent />
              </AssistantScreenProvider>
            </CurrentChannelProvider>
          </CommandPaletteProvider>
        </TutorialProvider>
      </PlayDraftProvider>
    </FormDraftsProvider>
  );
}

// The rail shows from 768px up, the top and bottom bars below (shell.css agrees). Only one set
// is mounted, so every control and announcement exists once.
const wideQuery = "(min-width: 768px)";
function subscribeWide(listener: () => void): () => void {
  if (typeof window.matchMedia !== "function") return () => {};
  const query = window.matchMedia(wideQuery);
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
}
function isWide(): boolean {
  return typeof window.matchMedia !== "function" || window.matchMedia(wideQuery).matches;
}
function useWide(): boolean {
  return useSyncExternalStore(subscribeWide, isWide, () => true);
}

function reloadPage(): void {
  window.location.reload();
}

// Help: the tour first, then the guides, the keys, the patch notes and Slopify's own update.
// On a phone it also holds the Assistant and the support links, so the top bar stays two words.
function HelpMenu({
  update,
  phone,
  onAssistant,
  className,
}: {
  readonly update: UpdateView;
  readonly phone: boolean;
  readonly onAssistant: () => void;
  readonly className: string;
}): ReactElement {
  const tutorial = useTutorial();
  const palette = useCommandPalette();
  const onHelp = useLocation({ select: (location) => location.pathname.startsWith("/help") });
  return (
    <Menu modal={false}>
      <MenuTrigger className={className} aria-current={onHelp ? "page" : undefined}>
        <CircleHelpIcon {...iconProps} />
        <span>Help</span>
      </MenuTrigger>
      <MenuContent side={phone ? "bottom" : "right"} align="end" className="min-w-[220px]">
        {tutorial === undefined || tutorial.active ? null : (
          <MenuItem onSelect={tutorial.start}>
            <CompassIcon {...iconProps} className="size-4" />
            Start the tour
          </MenuItem>
        )}
        <MenuItem asChild>
          <Link to="/help/tutorials/$page" params={{ page: "Home" }} className="no-underline">
            <BookOpenIcon {...iconProps} className="size-4" />
            Tutorials
          </Link>
        </MenuItem>
        {phone ? null : (
          <MenuItem onSelect={palette.showShortcuts}>
            <KeyboardIcon {...iconProps} className="size-4" />
            Keyboard shortcuts
          </MenuItem>
        )}
        <MenuItem asChild>
          <Link to="/settings" search={{ section: "patch-notes" }} className="no-underline">
            <NewspaperIcon {...iconProps} className="size-4" />
            What's new
          </Link>
        </MenuItem>
        {phone ? (
          <MenuItem onSelect={onAssistant}>
            <SparklesIcon {...iconProps} className="size-4" />
            Assistant
          </MenuItem>
        ) : null}
        <MenuSeparator />
        <UpdateMenuRows update={update} />
        {phone ? (
          <>
            <MenuSeparator />
            <SupportRows />
          </>
        ) : null}
      </MenuContent>
    </Menu>
  );
}

function SupportMenu(): ReactElement {
  return (
    <Menu modal={false}>
      <MenuTrigger className="sl-navrail__item">
        <HandHeartIcon {...iconProps} />
        <span>Support</span>
      </MenuTrigger>
      <MenuContent side="right" align="end">
        <SupportRows />
      </MenuContent>
    </Menu>
  );
}

function CreateKey({ className }: { readonly className: string }): ReactElement {
  const onCreate = useLocation({ select: (location) => location.pathname === "/play" });
  return (
    <PlayKey asChild className={className}>
      <Link
        to="/play"
        aria-current={onCreate ? "page" : undefined}
        aria-keyshortcuts={ariaKeyShortcuts(shortcuts.newVideo)}
      >
        <PlusIcon {...iconProps} />
        Create
      </Link>
    </PlayKey>
  );
}

// "● 2 running", to Home's Running list. In the rail the lamp and the count sit over the word.
function RunningLink({
  running,
  className,
}: {
  readonly running: number;
  readonly className: string;
}): ReactElement | null {
  if (running === 0) return null;
  return (
    <Link to="/" hash="running" className={className}>
      <span className="sl-running__count">
        <Lamp tone="running" />
        {String(running)}
      </span>
      <span>running</span>
    </Link>
  );
}

function Rail({
  running,
  update,
  assistantOpen,
  onAssistant,
}: {
  readonly running: number;
  readonly update: UpdateView;
  readonly assistantOpen: boolean;
  readonly onAssistant: () => void;
}): ReactElement {
  const palette = useCommandPalette();
  const pathname = useLocation({ select: (location) => location.pathname });
  const shown = useDestinations();
  const channels = useCurrentChannel().channels.length;
  const lit = activeDestination(pathname, channels);
  return (
    <aside className="sl-app__rail" aria-label="App">
      <Link to="/" className="sl-app__logo">
        <Logo className="sl-wordmark__logo sl-app__mark" />
        <span className="sr-only">Slopify</span>
      </Link>
      <CreateKey className="sl-app__create" />
      <nav aria-label="Main navigation" className="sl-navrail">
        {shown.map((destination) => (
          <Link
            key={destination.id}
            to={destination.to}
            aria-current={lit === destination.id ? "page" : undefined}
            className="sl-navrail__item"
          >
            {destination.icon}
            <span>{destination.label}</span>
          </Link>
        ))}
      </nav>
      <RunningLink running={running} className="sl-navrail__running" />
      <div className="sl-app__foot">
        <UpdateWidget update={update} className="sl-navrail__item sl-navrail__item--news" />
        <button
          type="button"
          className="sl-navrail__item"
          aria-keyshortcuts="Control+K Meta+K"
          onClick={() => palette.setOpen(true)}
        >
          <SearchIcon {...iconProps} />
          <span>Search</span>
        </button>
        <button
          type="button"
          className="sl-navrail__item"
          aria-expanded={assistantOpen}
          onClick={onAssistant}
        >
          <SparklesIcon {...iconProps} />
          <span>Assistant</span>
        </button>
        <HelpMenu
          update={update}
          phone={false}
          onAssistant={onAssistant}
          className="sl-navrail__item"
        />
        <SupportMenu />
      </div>
    </aside>
  );
}

function TopBar({
  running,
  update,
  onAssistant,
}: {
  readonly running: number;
  readonly update: UpdateView;
  readonly onAssistant: () => void;
}): ReactElement {
  const palette = useCommandPalette();
  return (
    <header className="sl-topbar">
      <div className="sl-topbar__lead">
        <Link to="/" className="sl-wordmark px-0">
          <Logo className="sl-wordmark__logo" />
          <span className="max-[380px]:sr-only">Slopify</span>
        </Link>
        <RunningLink running={running} className="sl-topbar__running" />
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <UpdateWidget update={update} item={false} />
        <button type="button" className="sl-topbar__item" onClick={() => palette.setOpen(true)}>
          <SearchIcon {...iconProps} />
          <span>Search</span>
        </button>
        {/* An update to install shows in Help's own words, in the accent's ink, rather than as a
            third button the bar has no room for. */}
        <HelpMenu
          update={update}
          phone
          onAssistant={onAssistant}
          className={cn("sl-topbar__item", updateWords(update).news && "sl-topbar__item--news")}
        />
      </div>
    </header>
  );
}

function BottomBar(): ReactElement {
  const pathname = useLocation({ select: (location) => location.pathname });
  const shown = useDestinations();
  const channels = useCurrentChannel().channels.length;
  const lit = activeDestination(pathname, channels);
  const bar = shown.filter((destination) => phoneBar.has(destination.id));
  const more = shown.filter((destination) => !phoneBar.has(destination.id));
  const item = (destination: Destination) => (
    <Link
      key={destination.id}
      to={destination.to}
      aria-current={lit === destination.id ? "page" : undefined}
      className="sl-bottomnav__item"
    >
      {destination.icon}
      <span>{destination.label}</span>
    </Link>
  );
  return (
    <nav aria-label="Main navigation (phone)" className="sl-bottomnav">
      {bar.slice(0, 2).map(item)}
      <CreateKey className="sl-bottomnav__create" />
      {bar.slice(2).map(item)}
      <Menu modal={false}>
        <MenuTrigger
          className="sl-bottomnav__item"
          aria-current={more.some((one) => one.id === lit) ? "true" : undefined}
        >
          <EllipsisIcon {...iconProps} />
          <span>More</span>
        </MenuTrigger>
        <MenuContent side="top" align="end" className="min-w-[200px]">
          {more.map((destination) => (
            <MenuItem key={destination.id} asChild>
              <Link
                to={destination.to}
                aria-current={lit === destination.id ? "page" : undefined}
                className="no-underline [&>svg]:size-4"
              >
                {destination.icon}
                {destination.label}
              </Link>
            </MenuItem>
          ))}
        </MenuContent>
      </Menu>
    </nav>
  );
}

function ShellContent() {
  const { api, openEvents } = useApp();
  const main = useRef<HTMLElement>(null);
  const [connection, setConnection] = useState<Connection | undefined>(undefined);
  useShellLocation(main);
  const wide = useWide();
  const queryClient = useQueryClient();
  const [running, setRunning] = useState(0);
  const runs = useRunNotifications();
  const update = useUpdate(reloadPage);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const toggleAssistant = () => setAssistantOpen((shown) => !shown);
  useInstallKind();

  useEffect(() => {
    // Step events from every running project come here now, so a burst of them is one
    // reload of the lists a second at most.
    const refreshProjects = coalesce(() => {
      void queryClient.invalidateQueries({ queryKey: keys.projects });
    }, 1000);
    const unsubscribe = subscribeGlobal(openEvents, eventsUrl(api, "global"), {
      tally: setRunning,
      projectState: runs.observe,
      stageState: runs.observeStage,
      reviewFlagged: runs.observeReview,
      reviewAutoPassed: runs.observeAutoPass,
      scheduleTopics: (event) => {
        runs.observeTopics(event);
        void queryClient.invalidateQueries({ queryKey: ["schedules"] });
        void queryClient.invalidateQueries({ queryKey: ["schedule"] });
        void queryClient.invalidateQueries({ queryKey: keys.calendar });
      },
      templateSample: (event) => {
        void queryClient.invalidateQueries({ queryKey: ["template-studio", event.templateId] });
      },
      stagingChanged: () => {
        void queryClient.invalidateQueries({ queryKey: keys.staging });
      },
      designChanged: (event) => {
        void queryClient.invalidateQueries({
          queryKey: event.type === "design.changed" ? keys.designs : keys.designTemplates,
        });
      },
      connection: setConnection,
      // A reconnect means the tally and every list may have moved on while the socket
      // was down, and nothing is replayed.
      refetch: (projectId) => {
        if (projectId === undefined) void queryClient.invalidateQueries();
        else refreshProjects.ask();
      },
    });
    return () => {
      unsubscribe();
      refreshProjects.stop();
    };
  }, [api, openEvents, queryClient, runs]);

  return (
    <div className={cn("sl-app", assistantOpen && "sl-app--side-panel")}>
      {/* The first stop for the Tab key: past the rail, straight to the screen. */}
      <Button
        variant="primary"
        className="sl-skip"
        onClick={() => {
          main.current?.focus();
        }}
      >
        Skip to content
      </Button>
      <ShellCommands />
      <GlobalCommands />
      <PatchNotesCommand />
      <TutorialCommands />
      <ConnectionStatus connection={connection} />
      {wide ? (
        <Rail
          running={running}
          update={update}
          assistantOpen={assistantOpen}
          onAssistant={toggleAssistant}
        />
      ) : null}

      <div className="sl-app__main">
        {wide ? null : <TopBar running={running} update={update} onAssistant={toggleAssistant} />}
        <main ref={main} id="main" tabIndex={-1} className="sl-app__content sl-page">
          <Outlet />
        </main>
      </div>

      {wide ? null : <BottomBar />}

      <AssistantPanel open={assistantOpen} onClose={() => setAssistantOpen(false)} />
      <AppearanceSkin />
      <FirstRunNotice />
      <AutostartReminder />
      <WhatsNewTour />
      <PatchNotesPopup />
      <VersionPrompt reload={reloadPage} />
    </div>
  );
}
