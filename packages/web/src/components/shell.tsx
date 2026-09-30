import { useQueryClient } from "@tanstack/react-query";
import { Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import {
  BookIcon,
  BookOpenIcon,
  CalendarIcon,
  FilmIcon,
  HouseIcon,
  PlusIcon,
  SearchIcon,
  SettingsIcon,
  UsersIcon,
} from "lucide-react";
import { type ReactElement, useEffect, useState, useSyncExternalStore } from "react";
import { eventsUrl } from "@/api";
import { useApp } from "@/app-context";
import { AutostartReminder } from "@/autostart/autostart-reminder";
import { useInstallKind } from "@/autostart/use-install-kind";
import { ChannelPicker, CurrentChannelProvider, useCurrentChannel } from "@/channels/current";
import { GlobalCommands } from "@/components/global-commands";
import { SupportGlyph } from "@/components/glyph";
import { IconButton, PlayKey } from "@/components/kit/button";
import {
  ariaKeyShortcuts,
  CommandPaletteProvider,
  useCommand,
  useCommandPalette,
} from "@/components/kit/command-palette";
import { helpScope, InfoTip } from "@/components/kit/info-tip";
import { ButtonLink } from "@/components/kit/link";
import { Lamp } from "@/components/kit/status";
import { Logo } from "@/components/logo";
import { FirstRunNotice } from "@/components/notice";
import { AppearanceSkin } from "@/components/theme";
import { VersionPrompt } from "@/components/version-prompt";
import { subscribeGlobal } from "@/events";
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
// command palette button, the six destinations, the channel picker and the New project key; a
// thin top bar for the running tally, updates and help; the page below, full width up to
// content-max. On phones the rail becomes a bottom bar of five.
//
// `match` lists the paths a destination stays lit for. Schedules are the calendar's Schedules
// tab; the old /schedules address redirects there.
interface Destination {
  readonly id: string;
  readonly to: string;
  readonly label: string;
  readonly icon: ReactElement;
  readonly match: readonly string[];
  // Shown in the phone's bottom bar (five of the six fit).
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
    phone: false,
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

// Every destination, the New project key and the channel picker are commands too.
function NavigationCommands() {
  const navigate = useNavigate();
  const current = useCurrentChannel();
  const go = (to: string) => () => {
    void navigate({ to });
  };
  useCommand({
    id: "nav.home",
    title: "Open home",
    group: "Go to",
    shortcut: shortcuts.goHome,
    run: go("/"),
  });
  useCommand({
    id: "nav.channels",
    title: "Open channels",
    group: "Go to",
    run: go("/channels"),
    keywords: ["cast", "brand"],
    shortcut: shortcuts.goChannels,
  });
  useCommand({
    id: "nav.schedules",
    title: "Open schedules",
    group: "Go to",
    run: () => {
      void navigate({ to: "/calendar", search: { tab: "schedules" } });
    },
    keywords: ["calendar", "topics"],
    shortcut: shortcuts.goSchedules,
  });
  useCommand({
    id: "channel.all",
    title: "Show all channels",
    group: "Channel",
    run: () => current.setChannelId(null),
    keywords: ["switch", "filter"],
  });

  useCommand({
    id: "create.video",
    title: "New project",
    group: "Create",
    run: go("/play"),
    keywords: ["play", "make", "start"],
    shortcut: shortcuts.newVideo,
  });
  useCommand({
    id: "nav.projects",
    title: "Open projects",
    group: "Go to",
    shortcut: shortcuts.goProjects,
    run: go("/projects"),
  });
  useCommand({
    id: "nav.calendar",
    title: "Open calendar",
    group: "Go to",
    run: go("/calendar"),
    keywords: ["schedules"],
    shortcut: shortcuts.goCalendar,
  });
  useCommand({
    id: "nav.library",
    title: "Open library",
    group: "Go to",
    run: go("/prompts"),
    keywords: ["prompts", "templates"],
    shortcut: shortcuts.goLibrary,
  });
  useCommand({
    id: "nav.settings",
    title: "Open settings",
    group: "Go to",
    run: go("/settings"),
    keywords: ["providers", "keys", "appearance"],
    shortcut: shortcuts.goSettings,
  });
  useCommand({
    id: "nav.tutorials",
    title: "Open tutorials",
    group: "Go to",
    run: () => {
      void navigate({ to: "/help/tutorials/$page", params: { page: "Home" } });
    },
    keywords: ["help", "guide", "wiki", "docs", "how"],
  });
  useCommand({
    id: "nav.usage",
    title: "Open usage and costs",
    group: "Go to",
    run: () => {
      void navigate({ to: "/settings", search: { section: "usage" } });
    },
    keywords: ["cost", "limits"],
  });
  return null;
}

// One command per channel, as a component so the list can grow and shrink.
function ChannelCommand({ id, name }: { readonly id: string; readonly name: string }) {
  const current = useCurrentChannel();
  useCommand({
    id: `channel.${id}`,
    title: `Switch to ${name}`,
    group: "Channel",
    run: () => current.setChannelId(id),
    keywords: ["channel", "switch", "filter"],
  });
  return null;
}

function ChannelCommands() {
  const current = useCurrentChannel();
  return current.channels.map((channel) => (
    <ChannelCommand key={channel.id} id={channel.id} name={channel.name} />
  ));
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
      <NavigationCommands />
      <GlobalCommands />
      <PatchNotesCommand />
      <TutorialCommands />
      <ChannelCommands />
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
              New project
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
              {support.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  target="_blank"
                  rel="noreferrer"
                  title={link.label}
                  className="flex min-h-8 min-w-8 shrink-0 items-center justify-center text-ink-2 no-underline hover:text-ink"
                >
                  <SupportGlyph name={link.glyph} className={link.tone} />
                  <span className="sr-only">{link.label}</span>
                </a>
              ))}
              <UpdateWidget reload={() => window.location.reload()} />
              <TutorialsLink />
              <TutorialLauncher />
            </div>
          </header>
        )}

        <main className="sl-app__content sl-page">
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
