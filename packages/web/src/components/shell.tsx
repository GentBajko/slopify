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
import { keys } from "@/queries";

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

// The same two links the marketing page carries, on every screen of the app. They open in a
// tab of their own: the app is a local server and a run may be in flight, so navigating the
// only tab away from it is never what the press meant.
const support = [
  { href: "https://www.patreon.com/cw/GentBajko", label: "Patreon", glyph: "patreon" },
  { href: "https://buymeacoffee.com/gentbajko", label: "Buy Me a Coffee", glyph: "coffee" },
] as const;

export function Shell() {
  const { api, openEvents } = useApp();
  const queryClient = useQueryClient();
  const [running, setRunning] = useState(0);

  useEffect(
    () =>
      subscribeGlobal(openEvents, eventsUrl(api, "global"), {
        tally: setRunning,
        stagingChanged: () => {
          void queryClient.invalidateQueries({ queryKey: keys.staging });
        },
        // A reconnect means the tally and every list may have moved on while the socket
        // was down, and nothing is replayed.
        refetch: () => {
          void queryClient.invalidateQueries();
        },
      }),
    [api, openEvents, queryClient],
  );

  return (
    <div className="flex min-h-screen flex-col">
      <nav className="flex h-14 items-center gap-7 border-b border-line bg-panel px-7">
        <Link
          to="/"
          className="flex items-center gap-[10px] text-wordmark font-extrabold tracking-[-0.02em] text-ink"
        >
          {/* The mark sits 3 px below the text baseline so the goo reads as a
              descender. */}
          <Mark className="relative top-[3px] text-lamp-run" />
          Slopify
        </Link>
        {sections.map((section) => (
          <Link
            key={section.to}
            to={section.to}
            activeOptions={{ exact: section.exact }}
            className="border-b-2 border-transparent py-[18px] text-ink2 hover:text-ink"
            activeProps={{ className: "!border-lamp-run !text-ink" }}
          >
            {section.label}
          </Link>
        ))}
        <span className="flex-1" />
        {running === 0 ? null : (
          <Link to="/" className="engraved text-ink3 hover:text-ink2">
            {`${String(running)} running`}
          </Link>
        )}
      </nav>

      <main className="flex-1 px-7 py-6">
        <Outlet />
      </main>

      <footer className="flex flex-wrap items-center gap-[18px] border-t border-line px-7 py-[14px] text-label text-ink3">
        <span>Free. Your keys, your machine.</span>
        <span className="flex-1" />
        <span>Support the project</span>
        {support.map((link) => (
          <a
            key={link.href}
            href={link.href}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-[6px] text-ink2 underline hover:text-ink"
          >
            <SupportGlyph name={link.glyph} />
            {link.label}
          </a>
        ))}
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
