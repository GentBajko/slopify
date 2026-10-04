import { CloudOffIcon, RefreshCwIcon, WifiIcon } from "lucide-react";
import { type ReactElement, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { Connection } from "@/events";
import { cn } from "@/lib/utils";

// Whether the numbers on the page are live. The page hears every change over one event stream
// (`event-mux.ts`); while it is down, counts and progress stop moving and would look current.
// So a dropped stream says "Reconnecting…" (after a moment, so a blip shows nothing), a long
// one says Slopify cannot be reached and what to check, the browser going offline says so, and
// the way back says "Back online" for a few seconds. On reconnecting the shell reloads every
// list (`components/shell.tsx`), so "Back online" is true when it shows.

export const graceMs = 1500;
export const unreachableMs = 20_000;
export const backOnlineMs = 4000;

export type ConnectionView = "live" | "reconnecting" | "unreachable" | "offline" | "back";

function subscribeOnline(listener: () => void): () => void {
  window.addEventListener("online", listener);
  window.addEventListener("offline", listener);
  return () => {
    window.removeEventListener("online", listener);
    window.removeEventListener("offline", listener);
  };
}

function isOnline(): boolean {
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

export function useConnectionView(connection: Connection | undefined): ConnectionView {
  const online = useSyncExternalStore(subscribeOnline, isOnline, () => true);
  const [view, setView] = useState<ConnectionView>("live");
  const shown = useRef(false);
  shown.current = view !== "live" && view !== "back";
  const down = !online || connection === "lost";

  useEffect(() => {
    if (!online) {
      setView("offline");
      return;
    }
    if (connection === "lost") {
      const soon = setTimeout(() => setView("reconnecting"), graceMs);
      const long = setTimeout(() => setView("unreachable"), unreachableMs);
      return () => {
        clearTimeout(soon);
        clearTimeout(long);
      };
    }
    // Live again: say so only if the page had said it was not.
    if (!shown.current) {
      setView((current) => (current === "back" ? current : "live"));
      return;
    }
    setView("back");
    const done = setTimeout(() => setView("live"), backOnlineMs);
    return () => clearTimeout(done);
  }, [online, connection]);

  return down && view === "back" ? "live" : view;
}

const words: Readonly<Record<Exclude<ConnectionView, "live">, string>> = {
  reconnecting: "Reconnecting… Numbers on this page may be out of date.",
  unreachable:
    "Can't reach Slopify, so numbers on this page may be out of date. Check that Slopify is still running; this page reconnects by itself.",
  offline: "Offline. Numbers on this page may be out of date until the connection is back.",
  back: "Back online. The page is up to date.",
};

// One status line pinned to the top of the window, so it covers nothing it would push down.
// The region is always on the page, empty while live, so a screen reader hears each change.
export function ConnectionStatus({
  connection,
}: {
  readonly connection: Connection | undefined;
}): ReactElement {
  const view = useConnectionView(connection);
  const Icon = view === "back" ? WifiIcon : view === "reconnecting" ? RefreshCwIcon : CloudOffIcon;
  return (
    <div aria-live="polite" className="sl-connection-slot">
      {view === "live" ? null : (
        <p
          data-view={view}
          className={cn("sl-connection sl-enter", view !== "back" && "sl-connection--down")}
        >
          <Icon aria-hidden="true" strokeWidth={1.75} />
          {words[view]}
        </p>
      )}
    </div>
  );
}
