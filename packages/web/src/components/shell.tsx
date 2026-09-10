import { useQueryClient } from "@tanstack/react-query";
import { Link, Outlet } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { eventsUrl } from "@/api";
import { useApp } from "@/app-context";
import { Mark, SupportGlyph } from "@/components/glyph";
import { FirstRunNotice } from "@/components/notice";
import { AppearanceSkin } from "@/components/theme";
import { VersionPrompt } from "@/components/version-prompt";
import { subscribeGlobal } from "@/events";
import { FormDraftsProvider } from "@/lib/form-drafts";
import { coalesce } from "@/project/live";
import { keys } from "@/queries";
import { TutorialProvider } from "@/tutorial/context";
import { TutorialLauncher } from "@/tutorial/launcher";
import { UpdateWidget } from "@/updates/widget";

// One top bar on every app screen, the active item underlined in the running-lamp colour, in
// the order the reference sheet puts them. `exact: false` is a section that keeps an editor
// beneath it: Prompts stays lit while 05 is open, and Intros & Outros while its own editor is.
const sections = [
  { to: "/", label: "Projects", exact: true },
  { to: "/play", label: "Play", exact: true },
  { to: "/prompts", label: "Prompts", exact: false },
  { to: "/entries", label: "Intros & Outros", exact: false },
  { to: "/settings", label: "Settings", exact: true },
  { to: "/usage", label: "Usage", exact: true },
] as const;

// The same three links the marketing page's masthead carries, in the same order, on every
// screen of the app. They open in a tab of their own: the app is a local server and a run may
// be in flight, so navigating the only tab away from it is never what the press meant.
// The accent is the mark's own green, and it is what makes the two donation links read as
// something to press rather than another item of chrome. GitHub is a source link, not a
// donation, so its glyph stays the colour of the text beside it.
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
      <TutorialProvider>
        <ShellContent />
      </TutorialProvider>
    </FormDraftsProvider>
  );
}

function ShellContent() {
  const { api, openEvents } = useApp();
  const queryClient = useQueryClient();
  const [running, setRunning] = useState(0);

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
      <header className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 border-b border-line bg-panel px-4 min-[1280px]:flex min-[1280px]:h-14 min-[1280px]:gap-7 min-[1280px]:px-7">
        <Link
          to="/"
          className="flex h-14 shrink-0 items-center gap-[10px] text-wordmark font-extrabold tracking-[-0.02em] text-ink"
        >
          {/* The mark sits 3 px below the text baseline so the goo reads as a
              descender. */}
          <Mark className="relative top-[3px] text-lamp-run" />
          Slopify
        </Link>
        {/* Only this row scrolls on narrow screens. Its links remain keyboard reachable,
            and the logo, tutorial and support controls stay in the header above it. */}
        <nav
          aria-label="Main navigation"
          className="col-span-2 row-start-2 flex min-w-0 items-center gap-6 overflow-x-auto [scrollbar-width:thin] min-[1280px]:flex-1 min-[1280px]:gap-7"
        >
          {sections.map((section) => (
            <Link
              key={section.to}
              to={section.to}
              activeOptions={{ exact: section.exact }}
              className="shrink-0 whitespace-nowrap border-b-2 border-transparent py-3 text-ink2 hover:text-ink focus-visible:outline-offset-[-3px] min-[1280px]:py-[18px]"
              activeProps={{ className: "!border-lamp-run !text-ink" }}
            >
              {section.label}
            </Link>
          ))}
        </nav>
        <div className="col-start-2 row-start-1 ml-auto flex items-center gap-1 sm:gap-4 min-[1280px]:gap-7 [&_button]:min-h-8 [&_button]:min-w-8">
          <TutorialLauncher />
          {running === 0 ? null : (
            <Link
              to="/"
              aria-label={`${String(running)} running`}
              title={`${String(running)} running`}
              className="engraved flex min-h-8 items-center whitespace-nowrap text-ink3 hover:text-ink2"
            >
              {String(running)}
              <span className="sr-only sm:not-sr-only">&nbsp;running</span>
            </Link>
          )}
          {support.map((link) => (
            <a
              key={link.href}
              href={link.href}
              target="_blank"
              rel="noreferrer"
              title={link.label}
              className="flex min-h-8 min-w-8 shrink-0 items-center justify-center gap-[6px] whitespace-nowrap text-ink2 hover:text-ink"
            >
              <SupportGlyph name={link.glyph} className={link.tone} />
              <span className="sr-only min-[1100px]:not-sr-only">{link.label}</span>
            </a>
          ))}
        </div>
      </header>

      <main className="min-w-0 flex-1 px-4 py-6 pb-20 sm:px-7">
        <Outlet />
      </main>

      <footer
        id="app-footer"
        className="flex items-center gap-[18px] border-t border-line px-4 py-[14px] text-label sm:px-7 text-ink3"
      >
        <span>Free. Your keys, your machine.</span>
      </footer>

      <UpdateWidget reload={() => window.location.reload()} />
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
