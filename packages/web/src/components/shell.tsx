import { useQueryClient } from "@tanstack/react-query";
import { Link, Outlet } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { eventsUrl } from "@/api";
import { useApp } from "@/app-context";
import mark from "@/assets/logo-mark.svg";
import { FirstRunNotice } from "@/components/notice";
import { VersionPrompt } from "@/components/version-prompt";
import { subscribeGlobal } from "@/events";
import { keys } from "@/queries";

// One top bar on every app screen, the active item underlined in the running-lamp colour
// (uiux/03-experience.md). Prompts, Intros & Outros, Settings and Usage are S17-S22 and
// have no route yet, so they are not offered as links that go nowhere.
const sections = [
  { to: "/", label: "Projects" },
  { to: "/play", label: "Play" },
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
          <span
            aria-hidden="true"
            className="relative top-[3px] block size-[26px] bg-lamp-run"
            style={{
              maskImage: `url(${mark})`,
              maskSize: "contain",
              maskRepeat: "no-repeat",
              maskPosition: "center",
            }}
          />
          Slopify
        </Link>
        {sections.map((section) => (
          <Link
            key={section.to}
            to={section.to}
            activeOptions={{ exact: true }}
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

      <footer className="flex gap-[18px] border-t border-line px-7 py-[14px] text-label text-ink3">
        <span>Free. Your keys, your machine.</span>
      </footer>

      <FirstRunNotice />
      <VersionPrompt
        reload={() => {
          window.location.reload();
        }}
      />
    </div>
  );
}
