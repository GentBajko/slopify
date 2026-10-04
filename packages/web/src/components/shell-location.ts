import { useLocation } from "@tanstack/react-router";
import { type RefObject, useEffect, useRef } from "react";
import { useCurrentChannel } from "@/channels/current";
import { recordLocation } from "./came-from.js";
import { setFallbackTitle, titleForPath } from "./document-title.js";

// What the shell does each time the address changes: names the browser tab after the
// destination, remembers the list a project was opened from (`came-from.ts`), and, when the
// screen itself changed, moves focus to its heading so a keyboard or screen-reader user starts
// at the top of the new screen instead of on a link that is no longer there. A change of
// section or filter on the same screen keeps focus where it is.
export function useShellLocation(main: RefObject<HTMLElement | null>): void {
  const pathname = useLocation({ select: (current) => current.pathname });
  const search = useLocation({ select: (current) => current.search });
  const channels = useCurrentChannel().channels;

  useEffect(() => {
    setFallbackTitle(titleForPath(pathname));
  }, [pathname]);

  useEffect(() => {
    recordLocation(
      pathname,
      search as Readonly<Record<string, unknown>>,
      (id) => channels.find((channel) => channel.id === id)?.name,
    );
  }, [pathname, search, channels]);

  const first = useRef(true);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `pathname` is the trigger: focus moves when the screen changes, read from the DOM once it has drawn.
  useEffect(() => {
    // The first screen keeps the browser's own focus: nothing was moved away from.
    if (first.current) {
      first.current = false;
      return;
    }
    const frame = requestAnimationFrame(() => {
      const region = main.current;
      if (region === null) return;
      // A dialog opened by the new screen keeps its own focus.
      if (document.activeElement?.closest('[role="dialog"]')) return;
      const heading = region.querySelector<HTMLElement>("h1");
      const target = heading ?? region;
      if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
      target.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [pathname, main]);
}
