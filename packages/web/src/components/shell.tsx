import { useQueryClient } from "@tanstack/react-query";
import { Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import {
  BookIcon,
  CalendarIcon,
  FilmIcon,
  HouseIcon,
  PlusIcon,
  SearchIcon,
  SettingsIcon,
  UsersIcon,
} from "lucide-react";
import { type ReactElement, type ReactNode, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { eventsUrl } from "@/api";
import { useApp } from "@/app-context";
import { SupportGlyph } from "@/components/glyph";
import { PlayKey } from "@/components/kit/button";
import {
  CommandPaletteProvider,
  useCommand,
  useCommandPalette,
} from "@/components/kit/command-palette";
import { Lamp } from "@/components/kit/status";
import { FirstRunNotice } from "@/components/notice";
import { AppearanceSkin } from "@/components/theme";
import { VersionPrompt } from "@/components/version-prompt";
import { subscribeGlobal } from "@/events";
import { FormDraftsProvider } from "@/lib/form-drafts";
import { cn } from "@/lib/utils";
import { useRunNotifications } from "@/notifications/use-run-notifications";
import { PlayDraftProvider } from "@/play/draft-context";
import { coalesce } from "@/project/live";
import { keys } from "@/queries";
import { TutorialProvider } from "@/tutorial/context";
import { TutorialLauncher } from "@/tutorial/launcher";
import { UpdateWidget } from "@/updates/widget";

// The 3.0 shell (docs/design-system.md, Layout): a 232px left rail with the wordmark, the
// command palette button, the six destinations, the channel picker and the New video key; a
// thin top bar for the running tally, updates and help; the page below, full width up to
// content-max. On phones the rail becomes a bottom bar of five.
//
// `match` lists the paths a destination stays lit for.
// Calendar and Schedules live under Library's tabs too, but they light Calendar here.
// TODO(3.0 screens): Home has no route yet. Until it lands it goes to "/" (the projects list),
// lit on nothing of its own; point `to` and `match` at "/home" when that route exists.
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
    match: [],
    phone: true,
  },
  {
    id: "projects",
    to: "/",
    label: "Projects",
    icon: <FilmIcon {...iconProps} />,
    match: ["/", "/projects"],
    phone: true,
  },
  {
    id: "calendar",
    to: "/calendar",
    label: "Calendar",
    icon: <CalendarIcon {...iconProps} />,
    match: ["/calendar", "/schedules"],
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
    match: ["/library", "/prompts", "/entries", "/templates", "/document-themes"],
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

const channelSlotId = "sl-channel-slot";

// The channel picker's place in the rail. The channels screen renders its picker through
// this, so the shell does not need to know how channels are loaded.
export function ChannelPickerSlot({ children }: { readonly children: ReactNode }) {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setTarget(document.getElementById(channelSlotId));
  }, []);
  return target === null ? null : createPortal(children, target);
}

export function Shell() {
  return (
    <FormDraftsProvider>
      <PlayDraftProvider>
        <TutorialProvider>
          <CommandPaletteProvider>
            <ShellContent />
          </CommandPaletteProvider>
        </TutorialProvider>
      </PlayDraftProvider>
    </FormDraftsProvider>
  );
}

// Every destination and the New video key are commands too.
function NavigationCommands() {
  const navigate = useNavigate();
  const go = (to: string) => () => {
    void navigate({ to });
  };
  useCommand({
    id: "create.video",
    title: "New video",
    group: "Create",
    run: go("/play"),
    keywords: ["play", "make", "start"],
  });
  useCommand({ id: "nav.projects", title: "Open projects", group: "Go to", run: go("/") });
  useCommand({
    id: "nav.calendar",
    title: "Open calendar",
    group: "Go to",
    run: go("/calendar"),
    keywords: ["schedules"],
  });
  useCommand({
    id: "nav.library",
    title: "Open library",
    group: "Go to",
    run: go("/prompts"),
    keywords: ["prompts", "templates"],
  });
  useCommand({
    id: "nav.settings",
    title: "Open settings",
    group: "Go to",
    run: go("/settings"),
    keywords: ["providers", "keys", "appearance"],
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

function ShellContent() {
  const { api, openEvents } = useApp();
  const queryClient = useQueryClient();
  const [running, setRunning] = useState(0);
  const pathname = useLocation({ select: (location) => location.pathname });
  const runs = useRunNotifications();
  const palette = useCommandPalette();

  useEffect(() => {
    const refreshProjects = coalesce(() => {
      void queryClient.invalidateQueries({ queryKey: keys.projects });
    }, 200);
    const unsubscribe = subscribeGlobal(openEvents, eventsUrl(api, "global"), {
      tally: setRunning,
      projectState: runs.observe,
      scheduleTopics: () => {
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
      <aside className="sl-app__rail" aria-label="App">
        <Link to="/" className="sl-wordmark">
          <span className="sl-wordmark__dot" aria-hidden="true" />
          Slopify
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
        <div className="sl-app__foot">
          <div id={channelSlotId} className="flex flex-col gap-[10px] empty:hidden" />
          <PlayKey asChild className="h-12 text-[16px]">
            <Link to="/play">
              <PlusIcon {...iconProps} />
              New video
            </Link>
          </PlayKey>
          <p className="m-0 px-2 text-label text-ink-3">Free. Your keys, your machine.</p>
        </div>
      </aside>

      <div className="sl-app__main">
        <header className="sl-topbar">
          <div className="sl-topbar__lead">
            <Link to="/" className="sl-wordmark px-0 md:hidden">
              <span className="sl-wordmark__dot" aria-hidden="true" />
              <span className="max-[380px]:sr-only">Slopify</span>
            </Link>
            <button
              type="button"
              aria-label="Search or run a command"
              onClick={() => palette.setOpen(true)}
              className="sl-btn sl-btn--icon md:hidden"
            >
              <SearchIcon {...iconProps} />
            </button>
            {running === 0 ? null : (
              <Link
                to="/"
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
                className="hidden min-h-8 min-w-8 shrink-0 items-center justify-center gap-[6px] whitespace-nowrap text-small text-ink-2 no-underline hover:text-ink sm:flex"
              >
                <SupportGlyph name={link.glyph} className={link.tone} />
                <span className="sr-only min-[1280px]:not-sr-only">{link.label}</span>
              </a>
            ))}
            <UpdateWidget reload={() => window.location.reload()} />
            <TutorialLauncher />
          </div>
        </header>

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
      <VersionPrompt
        reload={() => {
          window.location.reload();
        }}
      />
    </div>
  );
}
