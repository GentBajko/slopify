import { useQueryClient } from "@tanstack/react-query";
import { Link, Outlet, useLocation } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { eventsUrl } from "@/api";
import { useApp } from "@/app-context";
import { Mark, SupportGlyph } from "@/components/glyph";
import { Lamp } from "@/components/lamp";
import { FirstRunNotice } from "@/components/notice";
import { AppearanceSkin } from "@/components/theme";
import { VersionPrompt } from "@/components/version-prompt";
import { subscribeGlobal } from "@/events";
import { FormDraftsProvider } from "@/lib/form-drafts";
import { cn } from "@/lib/utils";
import { PlayDraftProvider } from "@/play/draft-context";
import { coalesce } from "@/project/live";
import { keys } from "@/queries";
import { TutorialProvider } from "@/tutorial/context";
import { TutorialLauncher } from "@/tutorial/launcher";
import { UpdateWidget } from "@/updates/widget";

// One sticky bar on every app screen: four destinations, the running tally, the support links
// and the help controls, in one row. `match` lists the paths a destination stays lit for:
// Library holds the four reusable-material lists and their editors, Settings holds Usage.
const sections = [
  { to: "/", label: "Projects", match: ["/", "/projects"] },
  { to: "/play", label: "Play", match: ["/play"] },
  {
    to: "/prompts",
    label: "Library",
    match: ["/library", "/prompts", "/entries", "/templates", "/schedules"],
  },
  { to: "/settings", label: "Settings", match: ["/settings", "/usage"] },
] as const;

function isActive(pathname: string, match: readonly string[]): boolean {
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
    tone: "text-lamp-run",
  },
  {
    href: "https://buymeacoffee.com/gentbajko",
    label: "Buy Me a Coffee",
    glyph: "coffee",
    tone: "text-lamp-run",
  },
] as const;

export function Shell() {
  return (
    <FormDraftsProvider>
      <PlayDraftProvider>
        <TutorialProvider>
          <ShellContent />
        </TutorialProvider>
      </PlayDraftProvider>
    </FormDraftsProvider>
  );
}

function ShellContent() {
  const { api, openEvents } = useApp();
  const queryClient = useQueryClient();
  const [running, setRunning] = useState(0);
  const pathname = useLocation({ select: (location) => location.pathname });

  useEffect(() => {
    const refreshProjects = coalesce(() => {
      void queryClient.invalidateQueries({ queryKey: keys.projects });
    }, 200);
    const unsubscribe = subscribeGlobal(openEvents, eventsUrl(api, "global"), {
      tally: setRunning,
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
  }, [api, openEvents, queryClient]);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 flex h-12 min-w-0 items-center gap-4 border-b border-line bg-panel px-4 sm:gap-6 sm:px-6">
        <Link
          to="/"
          className="flex shrink-0 items-center gap-[10px] text-wordmark font-extrabold tracking-[-0.02em] text-ink"
        >
          {/* The mark sits 3 px below the text baseline so the goo reads as a
              descender. */}
          <Mark className="relative top-[3px] text-lamp-run" />
          <span className="max-[480px]:sr-only">Slopify</span>
        </Link>
        <nav
          aria-label="Main navigation"
          className="flex min-w-0 flex-1 items-stretch gap-5 self-stretch overflow-x-auto [scrollbar-width:none] sm:gap-6"
        >
          {sections.map((section) => {
            const active = isActive(pathname, section.match);
            return (
              <Link
                key={section.to}
                to={section.to}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex shrink-0 items-center border-b-2 whitespace-nowrap focus-visible:outline-offset-[-3px]",
                  active
                    ? "border-lamp-run text-ink"
                    : "border-transparent text-ink2 hover:text-ink",
                )}
              >
                {section.label}
              </Link>
            );
          })}
        </nav>
        <div className="flex shrink-0 items-center gap-1 sm:gap-3 [&_button]:min-h-8 [&_button]:min-w-8">
          {running === 0 ? null : (
            <Link
              to="/"
              aria-label={`${String(running)} running`}
              title={`${String(running)} running`}
              className="engraved flex min-h-8 items-center gap-2 whitespace-nowrap text-run-text hover:text-ink"
            >
              <Lamp state="running" />
              {String(running)}
              <span className="sr-only sm:not-sr-only">running</span>
            </Link>
          )}
          {support.map((link) => (
            <a
              key={link.href}
              href={link.href}
              target="_blank"
              rel="noreferrer"
              title={link.label}
              className="hidden min-h-8 min-w-8 shrink-0 items-center justify-center gap-[6px] whitespace-nowrap text-ink2 hover:text-ink sm:flex"
            >
              <SupportGlyph name={link.glyph} className={link.tone} />
              <span className="sr-only min-[1100px]:not-sr-only">{link.label}</span>
            </a>
          ))}
          <UpdateWidget reload={() => window.location.reload()} />
          <TutorialLauncher />
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1200px] min-w-0 flex-1 px-4 pt-5 pb-10 sm:px-6">
        <Outlet />
      </main>

      <footer
        id="app-footer"
        className="flex items-center gap-[18px] border-t border-line px-4 py-[14px] text-label text-ink3 sm:px-6"
      >
        <span>Free. Your keys, your machine.</span>
      </footer>

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
