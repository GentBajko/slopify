import { useQueryClient } from "@tanstack/react-query";
import { Link, Outlet, useLocation } from "@tanstack/react-router";
import {
  BookIcon,
  BookOpenIcon,
  CalendarIcon,
  FilmIcon,
  HeartIcon,
  HouseIcon,
  PlusIcon,
  SearchIcon,
  SettingsIcon,
  UsersIcon,
} from "lucide-react";
import { type ReactElement, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { eventsUrl } from "@/api";
import { useApp } from "@/app-context";
import { AutostartReminder } from "@/autostart/autostart-reminder";
import { useInstallKind } from "@/autostart/use-install-kind";
import { ChannelPicker, CurrentChannelProvider } from "@/channels/current";
import { ConnectionStatus } from "@/components/connection-status";
import { GlobalCommands } from "@/components/global-commands";
import { SupportGlyph } from "@/components/glyph";
import { Button, IconButton, PlayKey } from "@/components/kit/button";
import {
  ariaKeyShortcuts,
  CommandPaletteProvider,
  useCommandPalette,
} from "@/components/kit/command-palette";
import { helpScope, InfoTip } from "@/components/kit/info-tip";
import { ButtonLink } from "@/components/kit/link";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/kit/menu";
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
import { TutorialProvider } from "@/tutorial/context";
import { TutorialLauncher } from "@/tutorial/launcher";
import { TutorialCommands } from "@/tutorials/commands";
import { UpdateWidget } from "@/updates/widget";
import { WhatsNewTour } from "@/whats-new/tour";

// The 3.0 shell (docs/design-system.md, Layout): a 232px left rail with the wordmark, the
// command palette button, the six destinations, the channel picker and the Create key; a
// thin top bar for the running tally, updates and help; the page below, full width up to
// content-max. On phones the rail becomes a bottom bar of six.
//
// `match` lists the paths a destination stays lit for. Schedules are the calendar's Schedules
// tab; the old /schedules address redirects there.
interface Destination {
  readonly id: string;
  readonly to: string;
  readonly label: string;
  readonly icon: ReactElement;
  readonly match: readonly string[];
  // Shown in the phone's bottom bar (all six: Channels too, so nothing is reachable only
  // through Ctrl+K on a phone).
  readonly phone: boolean;
}

const iconProps = { "aria-hidden": true, strokeWidth: 1.75 } as const;

const destinations: readonly Destination[] = [
  {
    id: "home",
    to: "/",
    label: "Home",
    icon: <HouseIcon {...iconProps} />,
    match: ["/"],
    phone: true,
  },
  {
    id: "projects",
    to: "/projects",
    label: "Projects",
    icon: <FilmIcon {...iconProps} />,
    match: ["/projects"],
    phone: true,
  },
  {
    id: "calendar",
    to: "/calendar",
    label: "Calendar",
    icon: <CalendarIcon {...iconProps} />,
    match: ["/calendar"],
    phone: true,
  },
  {
    id: "channels",
    to: "/channels",
    label: "Channels",
    icon: <UsersIcon {...iconProps} />,
    match: ["/channels"],
    phone: true,
  },
  {
    id: "library",
    to: "/prompts",
    label: "Library",
    icon: <BookIcon {...iconProps} />,
    match: [
      "/library",
      "/prompts",
      "/entries",
      "/templates",
      "/document-themes",
      "/narration-aliases",
      "/ab-results",
    ],
    phone: true,
  },
  {
    id: "settings",
    to: "/settings",
    label: "Settings",
    icon: <SettingsIcon {...iconProps} />,
    match: ["/settings", "/usage"],
    phone: true,
  },
];

// On a phone the three support links are one menu, so the top bar keeps room for search,
// updates and help.
function SupportMenu(): ReactElement {
  return (
    <Menu modal={false}>
      <MenuTrigger asChild>
        <IconButton label="Support Slopify" className="shrink-0">
          <HeartIcon {...iconProps} />
        </IconButton>
      </MenuTrigger>
      <MenuContent>
        {support.map((link) => (
          <MenuItem key={link.href} asChild>
            <a href={link.href} target="_blank" rel="noreferrer" className="no-underline">
              <SupportGlyph name={link.glyph} className={link.tone} />
              {link.label}
            </a>
          </MenuItem>
        ))}
      </MenuContent>
    </Menu>
  );
}

// Help → Tutorials, beside the interactive tutorial's button: the guides to every screen.
function TutorialsLink(): ReactElement {
  return (
    <ButtonLink
      to="/help/tutorials/$page"
      params={{ page: "Home" }}
      variant="icon"
      aria-label="Tutorials"
      data-tip="Tutorials"
      className="shrink-0"
    >
      <BookOpenIcon {...iconProps} />
    </ButtonLink>
  );
}

export function isActive(pathname: string, match: readonly string[]): boolean {
  return match.some((path) =>
    path === "/" ? pathname === "/" : pathname === path || pathname.startsWith(`${path}/`),
  );
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

export function Shell() {
  return (
    <FormDraftsProvider>
      <PlayDraftProvider>
        <TutorialProvider>
          <CommandPaletteProvider>
            <CurrentChannelProvider>
              <ShellContent />
            </CurrentChannelProvider>
          </CommandPaletteProvider>
        </TutorialProvider>
      </PlayDraftProvider>
    </FormDraftsProvider>
  );
}

// The sidebar shows from 768px up (shell.css hides it below). The update and tutorial
// buttons are mounted in one place only, so an update is announced once, not twice.
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

function ShellContent() {
  const { api, openEvents, version } = useApp();
  const main = useRef<HTMLElement>(null);
  const [connection, setConnection] = useState<Connection | undefined>(undefined);
  useShellLocation(main);
  const loadedVersion = useSyncExternalStore(version.subscribe, version.loadedAt, version.loadedAt);
  const wide = useWide();
  const queryClient = useQueryClient();
  const [running, setRunning] = useState(0);
  const pathname = useLocation({ select: (location) => location.pathname });
  const runs = useRunNotifications();
  const palette = useCommandPalette();
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
      reviewFlagged: runs.observeReview,
      scheduleTopics: (event) => {
        runs.observeTopics(event);
        void queryClient.invalidateQueries({ queryKey: ["schedules"] });
        void queryClient.invalidateQueries({ queryKey: ["schedule"] });
        void queryClient.invalidateQueries({ queryKey: ["calendar"] });
      },
      stagingChanged: () => {
        void queryClient.invalidateQueries({ queryKey: keys.staging });
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
    <div className="sl-app">
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
      <aside className="sl-app__rail" aria-label="App">
        <Link to="/" className="sl-wordmark">
          <Logo className="sl-wordmark__logo" />
          Slopify
          {loadedVersion === undefined ? null : (
            <span className="sl-wordmark__version">{`v${loadedVersion}`}</span>
          )}
        </Link>
        <button type="button" className="sl-searchbtn" onClick={() => palette.setOpen(true)}>
          <SearchIcon {...iconProps} />
          <span className="min-w-0 flex-1 truncate text-left">Search or run a command</span>
          <span className="sl-kbd" aria-hidden="true">
            <kbd>Ctrl</kbd>
            <kbd>K</kbd>
          </span>
        </button>
        <nav aria-label="Main navigation" className="sl-rail">
          {destinations.map((destination) => (
            <Link
              key={destination.id}
              to={destination.to}
              aria-current={isActive(pathname, destination.match) ? "page" : undefined}
              className="sl-rail__item"
            >
              {destination.icon}
              {destination.label}
            </Link>
          ))}
        </nav>
        {running === 0 ? null : (
          <Link
            to="/"
            hash="running"
            className="sl-status sl-status--running px-3 no-underline hover:text-ink"
          >
            <Lamp tone="running" />
            {`${String(running)} running`}
          </Link>
        )}
        <div className="sl-app__foot">
          <div className="flex items-end gap-1" {...helpScope}>
            <ChannelPicker className="min-w-0 flex-1" />
            <InfoTip id="home.channel" className="mb-1" />
          </div>
          <PlayKey asChild className="h-12 text-[16px]">
            <Link to="/play" aria-keyshortcuts={ariaKeyShortcuts(shortcuts.newVideo)}>
              <PlusIcon {...iconProps} />
              Create
            </Link>
          </PlayKey>
          <nav aria-label="Support Slopify" className="sl-rail__links">
            {support.map((link) => (
              <a
                key={link.href}
                href={link.href}
                target="_blank"
                rel="noreferrer"
                className="sl-rail__link"
              >
                <SupportGlyph name={link.glyph} className={link.tone} />
                {link.label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-1 px-1">
            <p className="m-0 min-w-0 flex-1 px-1 text-label text-ink-3">
              Free. Your keys, your machine.
            </p>
            {wide ? (
              <>
                <UpdateWidget reload={() => window.location.reload()} />
                <TutorialsLink />
                <TutorialLauncher />
              </>
            ) : null}
          </div>
        </div>
      </aside>

      <div className="sl-app__main">
        {/* Phones only: from tablet width up, the sidebar carries all of this. */}
        {wide ? null : (
          <header className="sl-topbar">
            <div className="sl-topbar__lead">
              <Link to="/" className="sl-wordmark px-0">
                <Logo className="sl-wordmark__logo" />
                <span className="max-[380px]:sr-only">Slopify</span>
              </Link>
              <IconButton label="Search or run a command" onClick={() => palette.setOpen(true)}>
                <SearchIcon {...iconProps} />
              </IconButton>
              {running === 0 ? null : (
                <Link
                  to="/"
                  hash="running"
                  aria-label={`${String(running)} running`}
                  title={`${String(running)} running`}
                  className="sl-status sl-status--running no-underline hover:text-ink"
                >
                  <Lamp tone="running" />
                  {String(running)}
                  <span className="sr-only sm:not-sr-only">running</span>
                </Link>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-1 sm:gap-2 [&_button]:min-h-8 [&_button]:min-w-8">
              <SupportMenu />
              <UpdateWidget reload={() => window.location.reload()} />
              <TutorialsLink />
              <TutorialLauncher />
            </div>
          </header>
        )}

        <main ref={main} id="main" tabIndex={-1} className="sl-app__content sl-page">
          <Outlet />
        </main>
      </div>

      <nav aria-label="Main navigation (phone)" className="sl-bottomnav">
        {destinations
          .filter((destination) => destination.phone)
          .map((destination) => (
            <Link
              key={destination.id}
              to={destination.to}
              aria-current={isActive(pathname, destination.match) ? "page" : undefined}
              className={cn(isActive(pathname, destination.match) && "text-ink")}
            >
              {destination.icon}
              {destination.label}
            </Link>
          ))}
      </nav>

      <AppearanceSkin />
      <FirstRunNotice />
      <AutostartReminder />
      <WhatsNewTour />
      <PatchNotesPopup />
      <VersionPrompt
        reload={() => {
          window.location.reload();
        }}
      />
    </div>
  );
}
